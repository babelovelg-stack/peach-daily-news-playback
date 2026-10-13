import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const adapter = fileURLToPath(new URL("./peach-edge-tts.py", import.meta.url));
const harness = `
import json, runpy, sys, types
adapter, version, failure = sys.argv[1:4]
package = types.ModuleType("edge_tts")
package.__path__ = []
sys.modules["edge_tts"] = package
for name in ("communicate", "constants", "util", "version"):
    module = types.ModuleType("edge_tts." + name)
    setattr(package, name, module)
    sys.modules["edge_tts." + name] = module
package.version.__version__ = version
package.constants.TRUSTED_CLIENT_TOKEN = "test-public-client-token"
package.constants.VOICE_LIST = "unchanged-voice-list"
package.communicate.WSS_URL = "legacy-synthesis-endpoint"
package.communicate.SEC_MS_GEC_VERSION = "unchanged-signature-version"
def fake_main():
    if failure == "yes":
        error = RuntimeError("request URL with sensitive-query-value")
        error.status = 403
        raise error
    print(json.dumps({"url": package.communicate.WSS_URL,
        "voice_list": package.constants.VOICE_LIST,
        "signature": package.communicate.SEC_MS_GEC_VERSION,
        "args": sys.argv[1:]}))
package.util.main = fake_main
sys.argv = [adapter, "--voice", "zh-CN-XiaoyiNeural", "--rate=-4%",
    "--pitch=+8Hz", "--file", "speech.txt", "--write-media", "audio.mp3",
    "--write-subtitles", "captions.vtt"]
runpy.run_path(adapter, run_name="__main__")
`;

function runAdapter(version = "7.2.8", failure = "no") {
  return spawnSync("python3", ["-B", "-c", harness, adapter, version, failure], { encoding: "utf8" });
}

test("uses the current Microsoft synthesis endpoint without changing signing or voice settings", () => {
  const result = runAdapter();
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const url = new URL(output.url);
  assert.equal(url.protocol, "wss:");
  assert.equal(url.hostname, "api.msedgeservices.com");
  assert.equal(url.pathname, "/tts/cognitiveservices/websocket/v1");
  assert.equal(url.searchParams.get("Ocp-Apim-Subscription-Key"), "test-public-client-token");
  assert.equal(output.voice_list, "unchanged-voice-list");
  assert.equal(output.signature, "unchanged-signature-version");
  assert.deepEqual(output.args, ["--voice", "zh-CN-XiaoyiNeural", "--rate=-4%",
    "--pitch=+8Hz", "--file", "speech.txt", "--write-media", "audio.mp3",
    "--write-subtitles", "captions.vtt"]);
});

test("refuses to patch an unreviewed edge-tts version", () => {
  const result = runAdapter("8.0.0");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /requires edge-tts==7\.2\.8/);
});

test("propagates synthesis failure without exposing request query values", () => {
  const result = runAdapter("7.2.8", "yes");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /HTTP 403/);
  assert.doesNotMatch(result.stderr, /sensitive-query-value|Traceback|test-public-client-token/);
});

test("daily generation uses the project adapter and still validates all playback assets", () => {
  const source = fs.readFileSync(new URL("./peach-daily-news.mjs", import.meta.url), "utf8");
  assert.ok(source.includes('fileURLToPath(new URL("./peach-edge-tts.py", import.meta.url))'));
  assert.doesNotMatch(source, /"-m",\s*"edge_tts"/);
  assert.match(source, /await validateGeneratedPlaybackAssets\(message\.playbackData/);
});
