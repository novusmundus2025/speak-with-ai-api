import { describe, expect, it } from "vitest";
import { parseStructuredResponse } from "./mundusx.js";

describe("MundusX output parsing", () => {
  it("extracts the first response object and repairs the observed meaning-key typo", () => {
    const output = `runtime_metrics={"eval_count":12}; response={
      "speechAct":"information",
      "topic":"weather",
      imeaning:"The weather is nice.",
      "replies":[
        {"kind":"supportive","text":"Das stimmt.","meaning":"That is true.","purpose":"Agree"},
        {"kind":"continue","text":"Geniesst du die Sonne?","meaning":"Are you enjoying the sun?","purpose":"Continue"},
        {"kind":"alternative","text":"Mir ist es zu warm.","meaning":"It is too warm for me.","purpose":"Alternative"}
      ]
    } trailing text {"ignored":true}`;

    const result = parseStructuredResponse(output);

    expect(result.speechAct).toBe("information");
    expect(result.replies).toHaveLength(3);
    expect(result.meaning).toBe("The weather is nice.");
  });

  it("repairs a corrupted unquoted meaning key in its fixed schema position", () => {
    const output = `response={
      "speechAct":"information",
      "topic":"weather",
      chrə:"The weather is nice.",
      "replies":[
        {"kind":"supportive","text":"Das stimmt.","meaning":"That is true.","purpose":"Agree"},
        {"kind":"continue","text":"Geniesst du die Sonne?","meaning":"Are you enjoying the sun?","purpose":"Continue"},
        {"kind":"alternative","text":"Mir ist es zu warm.","meaning":"It is too warm for me.","purpose":"Alternative"}
      ]
    }`;

    expect(parseStructuredResponse(output).meaning).toBe("The weather is nice.");
  });
});
