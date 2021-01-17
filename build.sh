#!/bin/sh
tsc
rm -rf ./dist/node_modules
cp -R ./node_modules ./dist/node_modules
rm -rf deployment
mkdir deployment
cd dist
zip -q -r ../deployment/deployment.zip .