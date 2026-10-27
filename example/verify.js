import { editorExamples } from "./editor-examples.js";
import {
  buildExample,
  translateDrafts,
  disposeExample,
} from "./editor-session.js";
import { requestDemoDevice } from "./shared/device.js";
import { downloadSource } from "./source-export.js";
const $ = (selector) => document.querySelector(selector);
let report;
$("#download").addEventListener("click", () =>
  downloadSource(
    "webgpujs-compatibility",
    JSON.stringify(report, null, 2),
    "json",
  ),
);
$("#run").addEventListener("click", async () => {
  $("#run").disabled = true;
  $("#download").disabled = true;
  $("#results").replaceChildren();
  $("#report").textContent = "Checking…";
  const rebuild = $("#rebuild").checked;
  $("#rebuild").disabled = true;
  const uncaptured = [];
  report = {
    format: "webgpujs-compatibility",
    version: 1,
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    rebuild,
    results: [],
    uncaptured,
  };
  let device;
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter available");
    device = await requestDemoDevice(adapter);
    device.addEventListener("uncapturederror", (event) =>
      uncaptured.push(event.error.message),
    );
    report.adapter = {
      vendor: adapter.info?.vendor,
      architecture: adapter.info?.architecture,
      description: adapter.info?.description,
    };
    report.features = [...device.features];
    $("#environment").textContent = JSON.stringify(
      {
        userAgent: report.userAgent,
        adapter: report.adapter,
        features: report.features,
      },
      null,
      2,
    );
    for (const [index, definition] of editorExamples.entries()) {
      $("#status").textContent =
        `Checking ${index + 1}/${editorExamples.length}: ${definition.title}`;
      const row = document.createElement("tr");
      $("#results").append(row);
      const result = {
        id: definition.id,
        title: definition.title,
        passed: false,
      };
      let first, second;
      const canvas = () => {
        const c = document.createElement("canvas");
        [c.width, c.height] = definition.canvasSize || [512, 320];
        $("#preview").replaceChildren(c);
        return c;
      };
      const controls = Object.fromEntries(
        (definition.controls || []).map(([key, , , , , value]) => [key, value]),
      );
      device.pushErrorScope("validation");
      try {
        first = await buildExample(definition.setup, canvas(), device);
        const drafts = new Map(
          first.records.flatMap((record) =>
            record.shaders.map((shader) => [shader.id, shader.source]),
          ),
        );
        const translated = translateDrafts(first.records, drafts);
        if (translated.errors.length)
          throw new Error(translated.errors.map((e) => e.message).join("\n"));
        await first.demo.frame?.(1000, controls);
        // Gallery hosts read status after drawing; getters are part of a complete update.
        String(first.demo.resultInfo ?? first.demo.info ?? "");
        if (rebuild) {
          second = await buildExample(
            definition.setup,
            canvas(),
            device,
            drafts,
          );
          await second.demo.frame?.(1500, controls);
          disposeExample(first);
          first = undefined;
          await second.demo.frame?.(2000, controls);
          String(second.demo.resultInfo ?? second.demo.info ?? "");
        }
        await device.queue.onSubmittedWorkDone();
        result.passed = true;
        result.shaders = drafts.size;
      } catch (error) {
        result.error = error.message;
      } finally {
        disposeExample(first);
        disposeExample(second);
        const error = await device.popErrorScope();
        if (error) {
          result.passed = false;
          result.error = [result.error, error.message]
            .filter(Boolean)
            .join("\n");
        }
      }
      report.results.push(result);
      for (const text of [
        definition.title,
        result.passed ? "Pass" : "Fail",
        result.error ||
          `${result.shaders} shaders · disposed${rebuild ? " and rebuilt" : ""}`,
      ]) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.append(cell);
      }
      // Yield to input and paint without coupling test progress to animation visibility.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const passed = report.results.filter((result) => result.passed).length;
    report.passed = passed === editorExamples.length && !uncaptured.length;
    $("#status").textContent =
      `${passed}/${editorExamples.length} passed · ${uncaptured.length} uncaptured GPU errors`;
  } catch (error) {
    report.error = error.message;
    report.passed = false;
    $("#status").textContent = error.message;
  } finally {
    $("#report").textContent = JSON.stringify(report, null, 2);
    device?.destroy();
    $("#preview").replaceChildren();
    $("#run").disabled = false;
    $("#rebuild").disabled = false;
    $("#download").disabled = false;
  }
});
