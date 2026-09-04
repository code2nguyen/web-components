#!/usr/bin/env bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
source ~/.profile
# Move to root folder
pushd ../$(dirname -- "$0")

# Scan package folders (packages are nested one level deeper: components/ core/ tools/)
for d in packages/*/*/
do
    [ -f "$d/package.json" ] || continue
    (cd "$d" && npm link)
done
popd