import NetInfo from "@react-native-community/netinfo";
import * as ExpoLinking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { ShouldStartLoadRequest, WebViewErrorEvent, WebViewHttpErrorEvent, WebViewMessageEvent, WebViewNavigation, WebViewOpenWindowEvent } from "react-native-webview/lib/WebViewTypes";
import appJson from "./app.json";
import { INITIAL_LOAD_TIMEOUT_MS, resolveWebAppConfig } from "./src/config";
import { devLog } from "./src/log";
import { classifyNavigation, redactUrl } from "./src/navigation";
import { bridgeScript, callbackUrlFor, isSupabaseAuthorizeUrl, parseOAuthRequest, withAppRedirect } from "./src/oauth";
import { StatusScreen, type ShellProblem } from "./src/StatusScreen";
import { colors } from "./src/theme";

// Keep the native splash up until the web app has actually rendered, so the
// user never sees a blank white WebView.
void SplashScreen.preventAutoHideAsync();

const CONFIG = resolveWebAppConfig(process.env.EXPO_PUBLIC_WEB_APP_URL, __DEV__);

// Android fires the "finished" event immediately *before* the error event for
// a failed load, so a load only counts as successful if no error follows
// within this window.
const LOAD_SUCCESS_SETTLE_MS = 250;

// Lets the web app detect the shell if it ever needs to (e.g. to hide an
// "install the app" banner). Appended to the normal Chrome WebView UA.
const USER_AGENT_SUFFIX = `BoutiqoAndroid/${appJson.expo.version}`;

// Where Supabase sends the browser back after Google sign-in: boutiqo://auth-callback
// in a built APK, exp://<dev-server>/--/auth-callback in Expo Go. Must be in
// Supabase's redirect allow-list (see android/README.md).
const OAUTH_REDIRECT_URL = ExpoLinking.createURL("auth-callback");
const BRIDGE_SCRIPT = bridgeScript(OAUTH_REDIRECT_URL);

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        {CONFIG.ok ? <Shell url={CONFIG.url} origin={CONFIG.origin} /> : <ConfigError reason={CONFIG.reason} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function ConfigError({ reason }: { reason: string }) {
  useEffect(() => {
    devLog("config-error", { reason });
    SplashScreen.hide();
  }, [reason]);
  return <StatusScreen problem="config" />;
}

function Shell({ url, origin }: { url: string; origin: string }) {
  const webRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const lastUrlRef = useRef(url);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Remounting the WebView (after its renderer process dies) resumes at the last URL.
  const [webKey, setWebKey] = useState(0);
  const [sourceUrl, setSourceUrl] = useState(url);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [problem, setProblem] = useState<ShellProblem | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [offline, setOffline] = useState(false);

  const problemRef = useRef(problem);
  problemRef.current = problem;
  const offlineRef = useRef(false);

  const hideSplash = useCallback(() => SplashScreen.hide(), []);

  const fail = useCallback(
    (next: ShellProblem) => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      setProblem(next);
      setRetrying(false);
      hideSplash();
    },
    [hideSplash],
  );

  // Reload the last *app* page, never the failed URL: a failure can come from
  // a non-app page that slipped into the WebView (see onNavigationStateChange),
  // and reload() would just retry that page. Remounting behind the loader also
  // restarts the load timeout.
  const reloadApp = useCallback(() => {
    setProblem(null);
    setHasLoaded(false);
    setSourceUrl(lastUrlRef.current);
    setWebKey((k) => k + 1);
  }, []);

  const retry = useCallback(() => {
    devLog("retry", { url: redactUrl(lastUrlRef.current) });
    setRetrying(true);
    reloadApp();
  }, [reloadApp]);

  // Initial load timeout (slow network / server hanging).
  useEffect(() => {
    if (hasLoaded) return;
    const timer = setTimeout(() => {
      if (!problemRef.current) {
        devLog("initial-load-timeout");
        fail("timeout");
      }
    }, INITIAL_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [webKey, hasLoaded, fail]);

  // Connectivity: a banner while a loaded page stays usable, the full offline
  // screen when a load failed, and an automatic retry once back online.
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const isOffline = state.isConnected === false || state.isInternetReachable === false;
      const wasOffline = offlineRef.current;
      if (wasOffline === isOffline) return;
      devLog(isOffline ? "network-offline" : "network-online");
      offlineRef.current = isOffline;
      setOffline(isOffline);
      if (isOffline && problemRef.current && problemRef.current !== "config") setProblem("offline");
      if (!isOffline && problemRef.current) retry();
    });
  }, [retry]);

  // Coming back to the app with an error on screen: try again straight away.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      devLog("app-state", { next });
      if (next === "active" && problemRef.current) void NetInfo.fetch().then((s) => s.isConnected !== false && retry());
    });
    return () => sub.remove();
  }, [retry]);

  // Android back: go back inside the web app, and only exit/minimise at its start.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!problemRef.current && canGoBackRef.current) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const openExternal = useCallback((target: string) => {
    devLog("open-external", { url: redactUrl(target) });
    Linking.openURL(target).catch(() => devLog("open-external-failed", { url: redactUrl(target) }));
  }, []);

  // Google sign-in always runs in a secure browser tab (Google blocks it in
  // WebViews) and always returns to the app: whatever redirect the page asked
  // for is replaced with the app's own. Never full Chrome, where the user
  // would end up signed in on the website instead of in the app.
  const oauthInFlight = useRef(false);
  const startOAuth = useCallback(
    (authorizeUrl: string) => {
      if (oauthInFlight.current) return;
      oauthInFlight.current = true;
      devLog("oauth-start", { redirect: OAUTH_REDIRECT_URL });
      WebBrowser.openAuthSessionAsync(withAppRedirect(authorizeUrl, OAUTH_REDIRECT_URL), OAUTH_REDIRECT_URL)
        .then((result) => {
          devLog("oauth-result", { type: result.type });
          // Cancelled or dismissed: stay on the page the user started from.
          if (result.type !== "success") return;
          const target = callbackUrlFor(result.url, origin);
          webRef.current?.injectJavaScript(`window.location.assign(${JSON.stringify(target)});true;`);
        })
        .catch(() => devLog("oauth-failed"))
        .finally(() => {
          oauthInFlight.current = false;
        });
    },
    [origin],
  );

  const onShouldStartLoadWithRequest = useCallback(
    (req: ShouldStartLoadRequest) => {
      if (!req.isTopFrame) return true;
      // Backstop for a page that navigates to Google sign-in itself.
      if (isSupabaseAuthorizeUrl(req.url)) {
        startOAuth(req.url);
        return false;
      }
      const decision = classifyNavigation(req.url, origin);
      if (decision.kind === "internal") return true;
      if (decision.kind === "external") openExternal(decision.url);
      else devLog("navigation-blocked", { url: redactUrl(req.url) });
      return false;
    },
    [origin, openExternal, startOAuth],
  );

  // target="_blank" / window.open means "keep this page": loading the target in
  // place would throw away unsaved state (e.g. the signup form linking to
  // /terms), so new-window links, app pages included, open in the browser.
  const onOpenWindow = useCallback(
    (event: WebViewOpenWindowEvent) => {
      const target = event.nativeEvent.targetUrl;
      const decision = classifyNavigation(target, origin);
      if (decision.kind === "external") openExternal(decision.url);
      else if (decision.kind === "internal" && /^https?:/i.test(target)) openExternal(target);
    },
    [origin, openExternal],
  );

  const isAppUrl = useCallback((target: string) => target === origin || target.startsWith(`${origin}/`), [origin]);

  // Backstop for onShouldStartLoadWithRequest: react-native-webview lets a
  // navigation through if JS doesn't answer within 250ms (common in Expo Go's
  // dev mode, and on slow phones). Android only reports the new URL once the
  // page has committed, so a non-app page seen here is already on screen: hand
  // it to Android and put the app back.
  const escapedUrlRef = useRef<string | null>(null);
  const escapeToApp = useCallback(
    (target: string) => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (escapedUrlRef.current !== target) {
        escapedUrlRef.current = target;
        devLog("navigation-escaped", { url: redactUrl(target) });
        webRef.current?.stopLoading();
        const decision = classifyNavigation(target, origin);
        if (isSupabaseAuthorizeUrl(target)) startOAuth(target);
        else if (decision.kind === "external") openExternal(decision.url);
      }
      reloadApp();
    },
    [origin, openExternal, reloadApp, startOAuth],
  );

  // A top-level URL that isn't the web app and isn't an in-place scheme
  // (about:blank, blob:, data:).
  const isForeignUrl = useCallback(
    (target: string) => !isAppUrl(target) && classifyNavigation(target, origin).kind !== "internal",
    [isAppUrl, origin],
  );

  // Google sign-in requested by the web app (see src/oauth.ts).
  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const authorizeUrl = parseOAuthRequest(event.nativeEvent.data, event.nativeEvent.url, origin);
      if (authorizeUrl) startOAuth(authorizeUrl);
    },
    [origin, startOAuth],
  );

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      canGoBackRef.current = nav.canGoBack;
      if (isAppUrl(nav.url)) {
        lastUrlRef.current = nav.url;
        escapedUrlRef.current = null;
      } else if (isForeignUrl(nav.url)) {
        escapeToApp(nav.url);
      }
    },
    [isAppUrl, isForeignUrl, escapeToApp],
  );

  const onLoad = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      devLog("page-loaded", { url: redactUrl(lastUrlRef.current) });
      setHasLoaded(true);
      setProblem(null);
      setRetrying(false);
      hideSplash();
    }, LOAD_SUCCESS_SETTLE_MS);
  }, [hideSplash]);

  const onError = useCallback(
    (event: WebViewErrorEvent) => {
      // Stop react-native-webview from swapping in its own raw error view.
      event.preventDefault();
      const { description, code } = event.nativeEvent;
      devLog("load-error", { code, description, url: redactUrl(event.nativeEvent.url) });
      // A non-app page failed inside the WebView: send it to Android and put
      // the app back, rather than showing an error for a page that isn't ours.
      if (isForeignUrl(event.nativeEvent.url)) {
        escapeToApp(event.nativeEvent.url);
        return;
      }
      if (offlineRef.current || /INTERNET_DISCONNECTED|NETWORK_CHANGED/i.test(description)) fail("offline");
      else if (/TIMED_OUT/i.test(description)) fail("timeout");
      else if (/CONNECTION_REFUSED|CONNECTION_RESET|NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE/i.test(description)) fail("server");
      else fail("load-failed");
    },
    [fail, isForeignUrl, escapeToApp],
  );

  const onHttpError = useCallback(
    (event: WebViewHttpErrorEvent) => {
      // Only main-frame responses reach here on Android. 4xx pages (e.g. the
      // web app's own 404) are real app UI and stay on screen.
      const { statusCode } = event.nativeEvent;
      devLog("http-error", { statusCode, url: redactUrl(event.nativeEvent.url) });
      if (isForeignUrl(event.nativeEvent.url)) escapeToApp(event.nativeEvent.url);
      else if (statusCode >= 500) fail("server");
    },
    [fail, isForeignUrl, escapeToApp],
  );

  const onRenderProcessGone = useCallback(() => {
    devLog("render-process-gone");
    reloadApp();
  }, [reloadApp]);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <WebView
        key={webKey}
        ref={webRef}
        source={{ uri: sourceUrl }}
        style={styles.webview}
        containerStyle={styles.webview}
        // Every navigation goes through onShouldStartLoadWithRequest, which
        // keeps only the web app's own origin inside the WebView.
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        setSupportMultipleWindows
        onOpenWindow={onOpenWindow}
        onNavigationStateChange={onNavigationStateChange}
        onLoad={onLoad}
        onError={onError}
        onHttpError={onHttpError}
        onRenderProcessGone={onRenderProcessGone}
        onMessage={onMessage}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_SCRIPT}
        // Web platform features the app relies on (Supabase session in
        // cookies/localStorage, client-side rendering).
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        cacheMode="LOAD_DEFAULT"
        // The session cookie is first-party; nothing needs third-party cookies.
        thirdPartyCookiesEnabled={false}
        // Locked down: no local file access, no HTTP subresources on HTTPS pages.
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        geolocationEnabled={false}
        applicationNameForUserAgent={USER_AGENT_SUFFIX}
        webviewDebuggingEnabled={__DEV__}
        overScrollMode="content"
      />

      {!hasLoaded && !problem && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.plum} />
        </View>
      )}

      {problem && <StatusScreen problem={problem} onRetry={retry} retrying={retrying} />}

      {offline && !problem && (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text style={styles.bannerText}>You're offline — changes won't save until you reconnect.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  webview: { flex: 1, backgroundColor: colors.page },
  loading: { ...StyleSheet.absoluteFill, backgroundColor: colors.page, alignItems: "center", justifyContent: "center" },
  banner: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: colors.bannerBg, paddingVertical: 8, paddingHorizontal: 16 },
  bannerText: { color: colors.plumInk, fontSize: 13, textAlign: "center" },
});
