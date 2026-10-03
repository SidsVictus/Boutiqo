import NetInfo from "@react-native-community/netinfo";
import { requireOptionalNativeModule } from "expo";
import * as ExpoLinking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { ExpoSpeechRecognitionModuleType } from "expo-speech-recognition/build/ExpoSpeechRecognitionModule.types";
import type { ShouldStartLoadRequest, WebViewErrorEvent, WebViewHttpErrorEvent, WebViewMessageEvent, WebViewNavigation, WebViewOpenWindowEvent } from "react-native-webview/lib/WebViewTypes";
import appJson from "./app.json";
import { INITIAL_LOAD_TIMEOUT_MS, resolveWebAppConfig } from "./src/config";
import { devLog } from "./src/log";
import { classifyNavigation, redactUrl } from "./src/navigation";
import { appReturnUrl, bridgeScript, callbackUrlFor, isSupabaseAuthorizeUrl, parseOAuthRequest, withAppRedirect } from "./src/oauth";
import { StatusScreen, type ShellProblem } from "./src/StatusScreen";
import { parseVoiceCommand, recognitionOptions, voiceEventScript, type VoiceEvent } from "./src/voice";
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

// The app's own URL that brings the sign-in tab back here: boutiqo://auth-callback
// in a built APK, exp://<dev-server>/--/auth-callback in Expo Go. Supabase
// returns to the web app's /auth/app-callback, which forwards to it (see
// src/oauth.ts appReturnUrl), so it doesn't need to be on Supabase's allow-list.
const OAUTH_REDIRECT_URL = ExpoLinking.createURL("auth-callback");

// Android's speech recognizer (see src/voice.ts). Null in Expo Go, which
// doesn't bundle this module: the web app then shows its keyboard-mic fallback.
const Speech = requireOptionalNativeModule<ExpoSpeechRecognitionModuleType>("ExpoSpeechRecognition");
const BRIDGE_SCRIPT = bridgeScript(OAUTH_REDIRECT_URL, !!Speech);

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
      WebBrowser.openAuthSessionAsync(withAppRedirect(authorizeUrl, appReturnUrl(origin, OAUTH_REDIRECT_URL)), OAUTH_REDIRECT_URL)
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

  // Voice input for the web app: recognition runs natively, text goes back
  // to the page as events. Only one session at a time; any page change or
  // backgrounding the app aborts it.
  const voiceActive = useRef(false);
  const sendVoice = useCallback((event: VoiceEvent) => {
    webRef.current?.injectJavaScript(voiceEventScript(event));
  }, []);
  const stopVoice = useCallback((how: "stop" | "abort") => {
    if (!Speech || !voiceActive.current) return;
    try {
      if (how === "stop") Speech.stop();
      else Speech.abort();
    } catch {
      // already stopped
    }
  }, []);
  useEffect(() => {
    if (!Speech) return;
    const subs = [
      Speech.addListener("start", () => sendVoice({ type: "start" })),
      Speech.addListener("audiostart", () => sendVoice({ type: "audiostart" })),
      Speech.addListener("result", (e) => {
        const transcript = e.results[0]?.transcript ?? "";
        if (transcript) sendVoice({ type: "result", transcript, isFinal: e.isFinal });
      }),
      Speech.addListener("error", (e) => {
        devLog("voice-error", { code: e.error });
        sendVoice({ type: "error", code: e.error, message: e.message });
      }),
      Speech.addListener("end", () => {
        voiceActive.current = false;
        sendVoice({ type: "end" });
      }),
    ];
    const appState = AppState.addEventListener("change", (next) => {
      if (next !== "active") stopVoice("abort");
    });
    return () => {
      subs.forEach((s) => s.remove());
      appState.remove();
      stopVoice("abort");
    };
  }, [sendVoice, stopVoice]);

  const startVoice = useCallback(
    async (lang: string) => {
      if (!Speech) {
        sendVoice({ type: "error", code: "service-not-allowed", message: "Voice input needs the latest Boutiqo app." });
        sendVoice({ type: "end" });
        return;
      }
      const perm = await Speech.requestPermissionsAsync();
      if (!perm.granted) {
        sendVoice({ type: "error", code: "not-allowed", message: "Microphone permission is off.", canAskAgain: perm.canAskAgain });
        sendVoice({ type: "end" });
        return;
      }
      if (!Speech.isRecognitionAvailable()) {
        sendVoice({ type: "error", code: "service-not-allowed", message: "No speech recognition service on this phone. Install or update the Google app." });
        sendVoice({ type: "end" });
        return;
      }
      if (voiceActive.current) stopVoice("abort");
      voiceActive.current = true;
      devLog("voice-start", { lang });
      try {
        Speech.start(recognitionOptions(lang));
      } catch {
        voiceActive.current = false;
        sendVoice({ type: "error", code: "client", message: "Couldn't start the microphone." });
        sendVoice({ type: "end" });
      }
    },
    [sendVoice, stopVoice],
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

  // Messages from the web app: Google sign-in (src/oauth.ts) and voice input (src/voice.ts).
  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const { data, url: sender } = event.nativeEvent;
      const authorizeUrl = parseOAuthRequest(data, sender, origin);
      if (authorizeUrl) {
        startOAuth(authorizeUrl);
        return;
      }
      const voice = parseVoiceCommand(data, sender, origin);
      if (!voice) return;
      if (voice.action === "start") void startVoice(voice.lang);
      else if (voice.action === "open-settings") void Linking.openSettings();
      else stopVoice(voice.action);
    },
    [origin, startOAuth, startVoice, stopVoice],
  );

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      canGoBackRef.current = nav.canGoBack;
      if (nav.url !== lastUrlRef.current) stopVoice("abort");
      if (isAppUrl(nav.url)) {
        lastUrlRef.current = nav.url;
        escapedUrlRef.current = null;
      } else if (isForeignUrl(nav.url)) {
        escapeToApp(nav.url);
      }
    },
    [isAppUrl, isForeignUrl, escapeToApp, stopVoice],
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
