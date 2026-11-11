// Windows Script Host uses classic JScript. This file runs outside Electron.
var shell = new ActiveXObject("WScript.Shell");
var files = new ActiveXObject("Scripting.FileSystemObject");
var desktopSource = files.GetParentFolderName(WScript.ScriptFullName);
var project = files.GetParentFolderName(desktopSource);
var electron = "node_modules\\electron\\dist\\electron.exe";
var logDirectory;
var launchLog;

function quote(path) {
  return '"' + path + '"';
}

function ensureFolder(path) {
  if (!files.FolderExists(path)) {
    try {
      files.CreateFolder(path);
    } catch (error) {
      if (!files.FolderExists(path)) throw error;
    }
  }
}

function writeLog(message) {
  var stream = files.OpenTextFile(launchLog, 8, true, -1);
  try {
    stream.WriteLine(new Date().toUTCString() + " " + message);
  } finally {
    stream.Close();
  }
}

function createShortcut() {
  var path = files.BuildPath(shell.SpecialFolders("Desktop"), "Math Study Log.lnk");
  var shortcut = shell.CreateShortcut(path);
  var description = "Math Study Log - Development source";
  if (files.FileExists(path) && shortcut.Description !== description) {
    throw new Error("A different Math Study Log shortcut already exists: " + path);
  }
  shortcut.TargetPath = files.BuildPath(files.GetParentFolderName(WScript.FullName), "wscript.exe");
  shortcut.Arguments = "//nologo //E:JScript " + quote(WScript.ScriptFullName);
  shortcut.WorkingDirectory = project;
  shortcut.IconLocation = files.BuildPath(desktopSource, "icon.ico") + ",0";
  shortcut.Description = description;
  shortcut.Save();
  WScript.Echo("Created " + path);
}

function launch() {
  var appDirectory = files.BuildPath(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%"), "Math Study Log");
  ensureFolder(appDirectory);
  logDirectory = files.BuildPath(appDirectory, "logs");
  ensureFolder(logDirectory);
  launchLog = files.BuildPath(logDirectory, "launch.log");
  writeLog("Starting from " + project);
  if (!files.FileExists(files.BuildPath(project, electron))) {
    throw new Error("Electron was not found. Run Setup Math Study Log.cmd again.");
  }
  if (!files.FileExists(files.BuildPath(project, "package.json"))) {
    throw new Error("The project's package.json was not found. Run setup in the project folder.");
  }

  // Use a relative executable and app path from the checkout. Only Electron is
  // launched, so the GUI can show normally without a terminal or npm process.
  shell.CurrentDirectory = project;
  var environment = shell.Environment("Process");
  environment.Remove("ELECTRON_RUN_AS_NODE");
  environment("ELECTRON_LOG_FILE") = files.BuildPath(logDirectory, "electron.log");
  environment("MATH_STUDY_LOG_STARTUP_LOG") = files.BuildPath(logDirectory, "startup.log");
  var exitCode = shell.Run(quote(electron) + " . --enable-logging=file", 1, true);
  writeLog("Electron exited with code " + exitCode);
  if (exitCode !== 0) throw new Error("Electron exited with code " + exitCode + ".");
}

var setup = WScript.Arguments.length === 1 && WScript.Arguments(0) === "setup";
try {
  if (setup) createShortcut();
  else launch();
} catch (error) {
  var message = error.message || error.description || String(error);
  if (launchLog) {
    try { writeLog(message); } catch (logError) {}
  }
  WScript.Echo(logDirectory ? message + "\nLogs: " + logDirectory : message);
  WScript.Quit(1);
}
