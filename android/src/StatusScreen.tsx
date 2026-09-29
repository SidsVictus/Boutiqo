import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

export type ShellProblem = "offline" | "server" | "timeout" | "load-failed" | "config";

const COPY: Record<ShellProblem, { title: string; body: string }> = {
  offline: { title: "You're offline", body: "Connect to Wi-Fi or mobile data. Boutiqo will reload once you're back online." },
  server: { title: "Boutiqo is unavailable", body: "We couldn't reach Boutiqo right now. Please try again in a moment." },
  timeout: { title: "This is taking too long", body: "Your connection seems slow. Check it and try again." },
  "load-failed": { title: "Something went wrong", body: "The page couldn't be loaded. Please try again." },
  config: { title: "App misconfigured", body: "This build points at an invalid address. Please install the latest APK from your Boutiqo contact." },
};

/** Full-screen offline / error state with a retry button (never a blank WebView). */
export function StatusScreen({ problem, onRetry, retrying }: { problem: ShellProblem; onRetry?: () => void; retrying?: boolean }) {
  const copy = COPY[problem];
  return (
    <View style={styles.root} accessibilityRole="alert">
      <Image source={require("../assets/splash-icon.png")} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          disabled={retrying}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={({ pressed }) => [styles.button, (pressed || retrying) && styles.buttonPressed]}
        >
          {retrying ? <ActivityIndicator color={colors.plumInk} /> : <Text style={styles.buttonText}>Try again</Text>}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.page, alignItems: "center", justifyContent: "center", padding: 32 },
  logo: { width: 96, height: 96, marginBottom: 24 },
  title: { fontSize: 20, fontWeight: "700", color: colors.plum, textAlign: "center", marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: "center", maxWidth: 320, marginBottom: 28 },
  button: { minWidth: 160, height: 48, borderRadius: 999, backgroundColor: colors.plum, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: colors.plumInk, fontSize: 16, fontWeight: "600" },
});
