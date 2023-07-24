#!/usr/bin/env bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
source ~/.profile
# Move to root folder
pushd ../$(dirname -- "$0")

# Scan package folders
for d in packages/*/
do
    cd $d
    npm link     
    cd ..
done
popd