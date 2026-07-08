import { registerDefaultAnalysisTools } from "../analysis/analysis-tools";
import { registerDefaultMeasureTools } from "../analysis/measure-tools";
import { registerDefaultDrawEditTool } from "../draw/edit-tool";
import { registerDefaultDrawTools } from "../draw/draw-tools";

let registered = false;

export function registerDefaultToolFactories(): void {
  if (registered) {
    return;
  }

  registerDefaultDrawTools();
  registerDefaultDrawEditTool();
  registerDefaultMeasureTools();
  registerDefaultAnalysisTools();
  registered = true;
}
