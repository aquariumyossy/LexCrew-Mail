// Compiles and runs outlook/src/*.test.cs.
// Uses the .NET Framework csc that package.ps1 uses only when that csc and the
// WebView2 package are both present. Otherwise uses the dotnet SDK (LangVersion 5)
// and outlook/test/Stubs.cs. If neither is available, exits with a message.
// The temp directory is removed after the run.
// npm test does not run this. package.ps1 still omits *.test.cs.
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "outlook", "src");
const stubs = path.join(root, "outlook", "test", "Stubs.cs");
const webview = path.join(root, "outlook", "packages", "Microsoft.Web.WebView2.1.0.2903.40");

function productionSources() {
  return fs
    .readdirSync(srcDir)
    .filter((name) => name.endsWith(".cs") && !name.endsWith(".test.cs") && name !== "LoadProbe.cs" && name !== "TrayHost.cs")
    .map((name) => path.join(srcDir, name))
    .sort();
}

function testFiles() {
  return fs
    .readdirSync(srcDir)
    .filter((name) => name.endsWith(".test.cs"))
    .map((name) => path.join(srcDir, name))
    .sort();
}

function startupObject(file) {
  const base = path.basename(file).replace(/\.test\.cs$/i, "");
  return base + "Test";
}

function frameworkCsc() {
  if (process.platform !== "win32") return null;
  const windir = process.env.WINDIR || "C:\\Windows";
  const candidates = [
    path.join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(windir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
  ];
  return candidates.find((item) => fs.existsSync(item)) || null;
}

function webviewReady() {
  const core = path.join(webview, "lib", "net462", "Microsoft.Web.WebView2.Core.dll");
  const winforms = path.join(webview, "lib", "net462", "Microsoft.Web.WebView2.WinForms.dll");
  return fs.existsSync(core) && fs.existsSync(winforms);
}

function dotnetExe() {
  const home = process.env.DOTNET_ROOT;
  if (home) {
    const named = path.join(home, process.platform === "win32" ? "dotnet.exe" : "dotnet");
    if (fs.existsSync(named)) return named;
  }
  const local = path.join(os.homedir(), ".dotnet", process.platform === "win32" ? "dotnet.exe" : "dotnet");
  if (fs.existsSync(local)) return local;
  return "dotnet";
}

function run(command, args, extraEnv) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: Object.assign({}, process.env, extraEnv || {}),
    encoding: "utf8",
  });
  return result;
}

function fail(name, result) {
  process.stderr.write((result.stdout || "") + (result.stderr || ""));
  if (result.error) process.stderr.write(String(result.error) + "\n");
  throw new Error(name + " failed (" + (result.status == null ? "spawn" : result.status) + ")");
}

function xmlPath(value) {
  return value.replace(/&/g, "&amp;");
}

function writeProject(dir, startup, sources, reference) {
  fs.mkdirSync(dir, { recursive: true });
  const includes = sources
    .map((item) => '    <Compile Include="' + xmlPath(item) + '" />')
    .join("\n");
  const referenceXml = reference
    ? '    <Reference Include="KuruOutlook"><HintPath>' + xmlPath(reference) + "</HintPath></Reference>\n"
    : "";
  const xml = [
    "<Project Sdk=\"Microsoft.NET.Sdk\">",
    "  <PropertyGroup>",
    "    <OutputType>" + (startup ? "Exe" : "Library") + "</OutputType>",
    "    <AssemblyName>" + (startup || "KuruOutlook") + "</AssemblyName>",
    "    <TargetFramework>net8.0</TargetFramework>",
    "    <LangVersion>5</LangVersion>",
    "    <Nullable>disable</Nullable>",
    "    <ImplicitUsings>disable</ImplicitUsings>",
    "    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>",
    startup ? "    <StartupObject>" + startup + "</StartupObject>" : "",
    "  </PropertyGroup>",
    "  <ItemGroup>",
    includes,
    referenceXml.trimEnd(),
    "  </ItemGroup>",
    "</Project>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
  const project = path.join(dir, "test.csproj");
  fs.writeFileSync(project, xml);
  return project;
}

function compileWithCsc(csc, outDir) {
  const framework = path.dirname(csc);
  const core = path.join(webview, "lib", "net462", "Microsoft.Web.WebView2.Core.dll");
  const winforms = path.join(webview, "lib", "net462", "Microsoft.Web.WebView2.WinForms.dll");
  if (!fs.existsSync(core) || !fs.existsSync(winforms)) {
    throw new Error("WebView2 パッケージがありません: " + webview);
  }
  const dll = path.join(outDir, "KuruOutlook.dll");
  const refs = [
    "/r:System.dll",
    "/r:System.Core.dll",
    "/r:System.Windows.Forms.dll",
    "/r:System.Drawing.dll",
    "/r:Microsoft.CSharp.dll",
    "/r:" + path.join(framework, "System.Web.Extensions.dll"),
    "/r:" + core,
    "/r:" + winforms,
  ];
  const built = run(csc, ["/nologo", "/target:library", "/out:" + dll].concat(refs, productionSources()));
  if (built.status !== 0) fail("csc library", built);
  for (const file of testFiles()) {
    const name = startupObject(file);
    const exe = path.join(outDir, name + ".exe");
    const compiled = run(csc, ["/nologo", "/target:exe", "/out:" + exe, "/main:" + name, "/r:" + dll, file]);
    if (compiled.status !== 0) fail(name + " compile", compiled);
    const executed = run(exe, []);
    if (executed.status !== 0) fail(name, executed);
    process.stdout.write("ok " + name + "\n");
  }
  return "csc " + csc;
}

function dotnetWorks() {
  const dotnet = dotnetExe();
  const result = spawnSync(dotnet, ["--version"], {
    encoding: "utf8",
    env: Object.assign({}, process.env, {
      DOTNET_CLI_TELEMETRY_OPTOUT: "1",
      DOTNET_NOLOGO: "1",
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
    }),
  });
  if (result.status !== 0) return null;
  return dotnet;
}

function compileWithDotnet(dotnet, outDir) {
  const env = {
    DOTNET_CLI_TELEMETRY_OPTOUT: "1",
    DOTNET_NOLOGO: "1",
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
  };
  if (dotnet !== "dotnet") env.DOTNET_ROOT = path.dirname(dotnet);
  const libDir = path.join(outDir, "lib");
  const libProject = writeProject(libDir, "", productionSources().concat([stubs]), "");
  const lib = run(dotnet, ["build", libProject, "-c", "Release", "-v", "q", "--nologo"], env);
  if (lib.status !== 0) fail("dotnet library", lib);
  const dll = path.join(libDir, "bin", "Release", "net8.0", "KuruOutlook.dll");
  if (!fs.existsSync(dll)) throw new Error("library was not written: " + dll);
  for (const file of testFiles()) {
    const name = startupObject(file);
    const dir = path.join(outDir, name);
    const project = writeProject(dir, name, [file], dll);
    const built = run(dotnet, ["build", project, "-c", "Release", "-v", "q", "--nologo"], env);
    if (built.status !== 0) fail(name + " compile", built);
    const executed = run(dotnet, ["run", "--project", project, "-c", "Release", "--no-build", "--nologo"], env);
    if (executed.status !== 0) fail(name, executed);
    process.stdout.write("ok " + name + "\n");
  }
  return "dotnet LangVersion 5 (" + dotnet + ")";
}

function main() {
  const tests = testFiles();
  if (!tests.length) throw new Error("outlook/src/*.test.cs がありません");
  const csc = frameworkCsc();
  const useCsc = Boolean(csc && webviewReady());
  const dotnet = useCsc ? null : dotnetWorks();
  if (!useCsc && !dotnet) {
    throw new Error(
      "C# のテストを実行できません。WebView2 パッケージと .NET Framework の csc が両方あるときは csc、それ以外は dotnet SDK を使います。どちらも見つかりません。"
    );
  }
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kuru-cs-"));
  try {
    const how = useCsc ? compileWithCsc(csc, outDir) : compileWithDotnet(dotnet, outDir);
    process.stdout.write(tests.length + " C# tests passed with " + how + "\n");
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(String(error && error.message ? error.message : error) + "\n");
  process.exit(1);
}
