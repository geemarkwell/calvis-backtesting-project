import { Suspense } from "react";
import BacktestConsole from "./backtest/BacktestConsole";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <BacktestConsole />
    </Suspense>
  );
}
