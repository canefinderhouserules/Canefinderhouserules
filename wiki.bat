@echo off
rem Double-click to update the wiki and preview it at http://localhost:8000 (needs Git and Docker Desktop).
cd /d "%~dp0"

rem 1. Drop local changes to the generated sections only; they are rebuilt on start, so nothing is lost.
echo Descartando cambios en las secciones generadas...
git checkout -- docs/tools/spell-data.json docs/tools/item-data.json docs/tools/enemy-builder-data.json docs/tools/starwars-builder-data.json docs/tools/chakra-builder-data.json docs/tools/superheroes-builder-data.json docs/tools/archetypes
git clean -fq -- docs/tools/archetypes

rem 2. Pull. Hand-edited pages are left alone; if one of them blocks the pull, git says so.
echo Actualizando...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo No se pudo actualizar. Se levanta la wiki con lo que hay.
  pause
)

rem 3. Serve the wiki and the watcher.
echo Levantando la wiki en http://localhost:8000 ...
docker compose up --build
pause
