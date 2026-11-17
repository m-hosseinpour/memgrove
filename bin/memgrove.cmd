@echo off
rem Launcher for the `memgrove` CLI on Windows, without installing the package.
rem Mirrors bin/memgrove: puts the checkout on PYTHONPATH and runs the module.
setlocal
set "PYTHONPATH=%~dp0..;%PYTHONPATH%"
python -m memgrove %*
