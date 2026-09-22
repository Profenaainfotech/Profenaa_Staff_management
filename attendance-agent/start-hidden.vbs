' Starts the attendance agent with no visible window. Used by the scheduled task.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
agentDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = agentDir
logDir = sh.ExpandEnvironmentStrings("%APPDATA%") & "\ProfenaaAttendance"
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)
sh.Run "cmd /c node index.js >> """ & logDir & "\console.log"" 2>&1", 0, False
