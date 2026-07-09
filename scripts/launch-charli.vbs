' Runs the Charli launcher with no visible console window.
Dim shell, scriptDir
Set shell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & scriptDir & "\launch-charli.cmd""", 0, False
