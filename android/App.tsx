import NetInfo from "@react-native-community/netinfo";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { ShouldStartLoadRequest, WebViewErrorEvent, WebViewHttpErrorEvent, WebViewNavigation, WebViewOpenWindowEvent } from "react-native-webview/lib/WebViewTypes";
import appJson from "./app.json";
import { INITIAL_LOAD_TIMEOUT_MS, resolveWebAppConfig } from "./src/config";
import { devLog } from "./src/log";
import { classifyNavigation, redactUrl } from "./src/navigation";
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

  const retry = useCallback(() => {
    devLog("retry", { url: redactUrl(lastUrlRef.current) });
    setRetrying(true);
    if (hasLoaded) {
      webRef.current?.reload();
    } else {
      // Nothing rendered yet: remount behind the loader so the load timeout
      // starts over too.
      setProblem(null);
      setSourceUrl(lastUrlRef.current);
      setWebKey((k) => k + 1);
    }
  }, [hasLoaded]);

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

  const onShouldStartLoadWithRequest = useCallback(
    (req: ShouldStartLoadRequest) => {
      if (!req.isTopFrame) return true;
      const decision = classifyNavigation(req.url, origin);
      if (decision.kind === "internal") return true;
      if (decision.kind === "external") openExternal(decision.url);
      else devLog("navigation-blocked", { url: redactUrl(req.url) });
      return false;
    },
    [origin, openExternal],
  );

  // target="_blank" / window.open: app pages open in place, everything else leaves the app.
  const onOpenWindow = useCallback(
    (event: WebViewOpenWindowEvent) => {
      const target = event.nativeEvent.targetUrl;
      const decision = classifyNavigation(target, origin);
      if (decision.kind === "internal") webRef.current?.injectJavaScript(`window.location.assign(${JSON.stringify(target)});true;`);
      else if (decision.kind === "external") openExternal(decision.url);
    },
    [origin, openExternal],
  );

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      canGoBackRef.current = nav.canGoBack;
      if (nav.url === origin || nav.url.startsWith(`${origin}/`)) lastUrlRef.current = nav.url;
    },
    [origin],
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
      if (offlineRef.current || /INTERNET_DISCONNECTED|NETWORK_CHANGED/i.test(description)) fail("offline");
      else if (/TIMED_OUT/i.test(description)) fail("timeout");
      else if (/CONNECTION_REFUSED|CONNECTION_RESET|NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE/i.test(description)) fail("server");
      else fail("load-failed");
    },
    [fail],
  );

  const onHttpError = useCallback(
    (event: WebViewHttpErrorEvent) => {
      // Only main-frame responses reach here on Android. 4xx pages (e.g. the
      // web app's own 404) are real app UI and stay on screen.
      const { statusCode } = event.nativeEvent;
      devLog("http-error", { statusCode, url: redactUrl(event.nativeEvent.url) });
      if (statusCode >= 500) fail("server");
    },
    [fail],
  );

  const onRenderProcessGone = useCallback(() => {
    devLog("render-process-gone");
    setHasLoaded(false);
    setSourceUrl(lastUrlRef.current);
    setWebKey((k) => k + 1);
  }, []);

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
