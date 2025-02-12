# Overview

CLI Tool to generate Salesforce.com package.xml (and destructiveChange.xml) files based on git diff between two branches. 
Designed to work with SFDX via Visual Studio Code

**Please check your package before deploying as this script is still in development**

## Install

https://www.npmjs.com/package/sfdx-packager

```
npm install -g sfdx-packager
```

## Usage

```
$ sfdxpackage destinationBranch sourceBranch ./deploy/
```

This will create a package at ./deploy/sourceBranch/unpackaged/package.xml copying all files into directory.

If any deletes occurred will also create ./deploy/sourceBranch/destructive/destructiveChanges.xml

You can force a specific version for the package.xml with the -p flag

```
sfdxpackage destinationBranch sourceBranch -p 42 ./deploy/
```

You can also just write the package.xml and destructiveChanges.xml by passing the -d flag

```
sfdxpackage destinationBranch sourceBranch -d > ~/Desktop/packageAndDestructiveChanges.xml
```

You can also create "backout" content by reversing the order of the destination and source branches

```
sfdxpackage sourceBranch destinationBranch ./deploy/
```


