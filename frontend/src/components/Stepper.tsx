import { Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { STEPS } from "@/src/protocols";

export function Stepper({ step, declined }: { step: number; declined?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row} testID="journey-stepper">
      {STEPS.map((stepLabel, i) => {
        let label = stepLabel;
        const skipped = declined && i === STEPS.length - 2;
        const done = !skipped && (i < step || (i === step && i === STEPS.length - 1 && !declined));
        const active = i === step && !done && !declined;
        const failed = declined && i === step;
        if (declined && i === STEPS.length - 1) label = "Declined";
        return (
          <View key={stepLabel} style={styles.item}>
            <View style={styles.dotRow}>
              {i > 0 && <View style={[styles.line, i <= step && !(declined && i >= STEPS.length - 2) && styles.lineDone]} />}
              <View
                testID={`step-dot-${i}`}
                style={[styles.dot, done && styles.dotDone, active && styles.dotActive, failed && styles.dotFailed]}
              >
                {failed ? (
                  <Ionicons name="close" size={13} color={colors.onError} />
                ) : done ? (
                  <Ionicons name="checkmark" size={13} color={colors.onSuccess} />
                ) : (
                  <Text style={[styles.num, active && styles.numActive]}>{i + 1}</Text>
                )}
              </View>
              {i < STEPS.length - 1 && <View style={[styles.line, i < step && !(declined && i >= STEPS.length - 3) && styles.lineDone]} />}
            </View>
            <Text numberOfLines={1} style={[styles.label, (active || failed) && styles.labelActive]}>
              {label.toUpperCase()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 8 },
  item: { flex: 1, alignItems: "center" },
  dotRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", justifyContent: "center" },
  line: { flex: 1, height: 2, backgroundColor: c.border },
  lineDone: { backgroundColor: c.stepDone },
  dot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.borderStrong,
    backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center",
  },
  dotDone: { backgroundColor: c.stepDone, borderColor: c.stepDone },
  dotActive: { backgroundColor: c.stepActive, borderColor: c.stepActive },
  dotFailed: { backgroundColor: c.error, borderColor: c.error },
  num: { fontSize: 11, fontWeight: "700", color: c.muted },
  numActive: { color: c.onInfo },
  label: { marginTop: 4, fontSize: 8.5, fontWeight: "700", color: c.muted, letterSpacing: 0.3 },
  labelActive: { color: c.stepActive },
}));
