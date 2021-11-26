#!/usr/bin/env sh
# abort on errors
set -e
# if you are deploying to a custom domain
# echo 'www.example.com' > CNAME
git init
# git checkout -b main
git add -A
git commit -m 'deploy'
git push -f git@github.com:willismonroe/cams-mapping-vanilla-js.git main:gh-pages

