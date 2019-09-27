#!/usr/bin/env node

/**
 * CLI tool to parse git diff and build a package.xml file from it.
 * This is useful for using the MavensMate deployment tool and selecting the existing package.xml file
 * Also used in larger orgs to avoid deploying all metadata in automated deployments
 *
 * usage:
 *  $ sfdxpackage master featureBranch ./deploy/
 *
 *  This will create a file at ./deploy/featureBranch/unpackaged/package.xml
 *  and copy each metadata item into a matching folder.
 *  Also if any deletes occurred it will create a file at ./deploy/featureBranch/destructive/destructiveChanges.xml
 */
const program = require('commander');
const spawnSync = require('child_process').spawnSync;
const packageWriter = require('./lib/metaUtils').packageWriter;
const buildPackageDir = require('./lib/metaUtils').buildPackageDir;
const copyFiles = require('./lib/metaUtils').copyFiles;
const packageVersion = require('./package.json').version;

program
    .arguments('<compare> <branch> [target]')
    .version(packageVersion)
    .option('-d, --dryrun', 'Only print the package.xml and destructiveChanges.xml that would be generated')
    .option('-p, --pversion [version]', 'Salesforce version of the package.xml', parseInt)
    .option('-s, --silent', 'Run silently, no output')
    .action(function (compare, branch, target) {

        if (!branch || !compare) {
            console.error('branch and target branch are both required');
            program.help();
            process.exit(1);
        }

        const dryrun = program.dryrun;
        const silent = program.silent;

        if (!dryrun && !target) {
            console.error('target required when not dry-run');
            program.help();
            process.exit(1);
        }

        const currentDir = process.cwd();
        const gitDiff = spawnSync('git', ['--no-pager', 'diff', '--name-status', compare, branch]);
        const gitDiffStdOut = gitDiff.stdout.toString();
        const gitDiffStdErr = gitDiff.stderr.toString();

        if (gitDiffStdErr) {
            if(!silent) console.error('An error has occurred: %s', gitDiffStdErr);
            process.exit(1);
        }

        let fileListForCopy = [];

        //defines the different member types
        const metaBag = {};
        const metaBagDestructive = {};
        let deletesHaveOccurred = false;

        const fileList = gitDiffStdOut.split('\n');

        //get current folder
        let baseFolder = 'force-app/main/default/';

        fileList.forEach(function (fileName) {

            // get the git operation
            const operation = fileName.slice(0,1);
            // remove the operation and spaces from fileName
            fileName = fileName.slice(1).trim();

            //ensure file is inside of src directory of project
            if (fileName && fileName.length > baseFolder.length && fileName.substring(0,baseFolder.length) === baseFolder) {

                //ignore changes to the package.xml file
                if(fileName === 'manifest/package.xml') {
                    return;
                }

                if(fileName.indexOf(baseFolder) === 0){
                    fileName = fileName.substr(baseFolder.length);
                }

                const parts = fileName.split('/');
                // Check for invalid fileName, likely due to data stream exceeding buffer size resulting in incomplete string
                // TODO: need a way to ensure that full fileNames are processed - increase buffer size??
                
                if(parts[0] === 'staticresources'){
                    return;
                }
                if (parts[1] === undefined) {
                    if(!silent) console.error('File name "%s" cannot be processed, exiting', fileName);
                    process.exit(1);
                }
                
                let meta;
                let metaType = parts[0];

                if (parts.length === 4) {
                    // processing something in custom objects

                    meta = parts[1] + '.' + parts[3].split('.')[0];
                    metaType = parts[2];
                    
                    if(metaType === 'webLinks' && parts[0] === 'objects'){
                        metaType = 'objectWebLinks';
                    }

                } else if (parts.length === 3) {
                    // Processing metadata with nested folders e.g. emails, documents, reports
                    meta = parts[1] + '/' + parts[2].split('.')[0];
                } else {
                    // Processing metadata without nested folders. Strip -meta from the end.
                    let metaParts = parts[1].split('.');
                    meta = metaParts[0].replace('-meta', '');
                    if(metaParts.length > 3){ // this allows for custom metadata
                        metaParts.pop();
                        meta = metaParts.join('.').replace('.md-meta', '').replace('-meta', '');
                    }
                }

                if (operation === 'A' || operation === 'M') {
                    // file was added or modified - add fileName to array for unpackaged and to be copied
                    if(!silent) console.log('File was added or modified: %s', fileName);
                    fileListForCopy.push(fileName);

                    if (!metaBag.hasOwnProperty(metaType)) {
                        metaBag[metaType] = [];
                    }

                    if (metaBag[metaType].indexOf(meta) === -1) {
                        metaBag[metaType].push(meta);
                    }
                } else if (operation === 'D') {
                    // file was deleted
                    if(!silent) console.log('File was deleted: %s', fileName);
                    deletesHaveOccurred = true;

                    if (!metaBagDestructive.hasOwnProperty(metaType)) {
                        metaBagDestructive[metaType] = [];
                    }

                    if (metaBagDestructive[metaType].indexOf(meta) === -1) {
                        metaBagDestructive[metaType].push(meta);
                    }
                } else {
                    // situation that requires review
                    return (!silent)?console.error('Operation on file needs review: %s', fileName):'';
                }
            }
        });

        // build package file content
        const packageXML = packageWriter(metaBag, program.pversion);
        // build destructiveChanges file content
        const destructiveXML = packageWriter(metaBagDestructive, program.pversion);
        if (dryrun) {
            console.log('\npackage.xml\n');
            console.log(packageXML);
            console.log('\ndestructiveChanges.xml\n');
            console.log(destructiveXML);
            process.exit(0);
        }

        if(!silent) console.log('Building in directory %s', target);

        buildPackageDir(baseFolder, target, branch, metaBag, packageXML, false, (err, buildDir) => {
            if (err) {
                return (!silent)?console.error(err):'';
            }

            copyFiles(currentDir + '/' + baseFolder, buildDir, fileListForCopy);
            if(!silent) console.log('Successfully created package.xml and files in %s',buildDir);
        });

        if (deletesHaveOccurred) {
            buildPackageDir(baseFolder, target, branch, metaBagDestructive, destructiveXML, true, (err, buildDir) => {

                if (err) {
                    return (!silent)?console.error(err):'';
                }

                if(!silent) console.log('Successfully created destructiveChanges.xml in %s',buildDir);
            });
        }
    });

program.parse(process.argv);
