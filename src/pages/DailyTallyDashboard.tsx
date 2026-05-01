import DailyTally from "./DailyTally";

/**
 * Parent dashboard wrapper for Daily Tally.
 * Keeps interactive dashboard UI on top while print/PDF uses DailyTallyReport underneath.
 */
export default function DailyTallyDashboard() {
  return <DailyTally />;
}

