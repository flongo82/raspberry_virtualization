// express is used to handle API routes
var express = require('express');
var bodyParser = require('body-parser');
// via app variable we'll be using express module
var app = express();
var fs = require('fs');
var glob = require('glob');
var ps = require('ps-node');
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var pt = require('path');
var statvfs = require('statvfs');
var mknod = require('mknod');
var argv = require('minimist')(process.argv.slice(2));
var fuse = require('fuse-bindings');
var mkdirp = require('mkdirp');
var wrench = require('wrench'),
	util = require('util');

var lxd = require("node-lxd");
var client = lxd();
var gpio = require("gpio");
// using bodyParster.json in order to parse JSON strings
app.use(bodyParser.json());
// using bodyParser.urlenconded - without it express module won't be able to understand x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }))
// specifying port number on which application will be listening
var port = 8000;
// this function is desired to simplify remounts during server initialization
function folderRemount (folder, name, uid, gid) {
  fuse.unmount(`/gpio_mnt/${name}${folder}`, function (err) {
    // this is callback function, which handles errors
    if (err) {
      console.error(`filesystem at /gpio_mnt/${name}${folder} not unmounted due to error: ${err}`);
    } else {
      console.log(`filesystem at /gpio_mnt/${name}${folder} has been unmounted`);
    }
    folderMirroring (folder, `/gpio_mnt/${name}${folder}`, [`uid=${uid}`,`gid=${gid}`,`allow_other`]);
  });
}

// this function will be used later to unmount all fuse mount points of container
function unmountAllFuse (name, callback) {
  exec (`mount | grep -E "\/dev\/fuse on \/(gpio_mnt|var\/lib\/lxd\/devices)\/${name}\/"`, (error, stdout, stderr) => {
    if (error) {
      console.log (`No mounting points found for ${name} container ${error}`);    
      callback();
    } else {
      reg = /(\/gpio_mnt.*|\/var\/lib\/lxd\/devices\/.*)\stype\sfuse/g;
      while ((match = reg.exec(stdout.toString())) !== null) {
        mountPoint = match[1];
        console.log(`Found mounting point to unmount: ${mountPoint}`);
        // using fuse.unmount(), which actually removes FUSE mounting
        fuse.unmount(mountPoint, function (err) {
          // this is callback function, which handles errors
          if (err) {
            console.error('filesystem at ' + mountPoint + ' not unmounted', err)
          } else {
            console.log('filesystem at ' + mountPoint + ' unmounted')
          }
        });
      }
      callback();
    }
  });
}

// this function will be used later to recursively remove folder
function deleteFolderRecursive (path) {
  if( fs.existsSync(path) ) {
    fs.readdirSync(path).forEach(function(file,index){
      var curPath = path + "/" + file;
      if(fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
        console.log(curPath + " deleted");
      }
    });
  fs.rmdirSync(path);
  console.log(path + " deleted");
  }
};

// function is full copy of node-folder-mirroring script, just omitted initial checks of arguments count ant correctness
function folderMirroring (original_folder, mirror_folder, fuse_options) {
  if (!pt.isAbsolute(original_folder) || !pt.isAbsolute(mirror_folder)){
    console.log("Please use absolute paths!");
    return;
  }
  console.log("Mounting folder " + original_folder + " in folder " + mirror_folder);
  if(fuse_options != undefined)
    console.log("Fuse options: " + fuse_options);

    var getattr_function = function(path, cb){
        console.log('getattr(%s)',path);
        fs.lstat(pt.join(original_folder, path), function(err, stats){
            if(err){
                //console.log('error: ', err);                
                cb(fuse[err.code]);
            }
            else{
                cb(null,stats);
            }
        });
    }
    
    var access_function = function(path, mode, cb){
        console.log('access(%s)', path);
        fs.access(pt.join(original_folder, path), mode, function(err){
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            }
        });
    }
    
    var readlink_function = function(path, cb){
        console.log('readlink(%s)', path);
        fs.readlink(pt.join(original_folder, path), function(err, linkString){
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(null, linkString);
            }
        });        
    }
    
    var readdir_function = function(path, cb){
        console.log('readdir(%s)', path);
        fs.readdir(pt.join(original_folder, path), function(err, files){
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                console.log('files: ', files);
                cb(null,files);
            }
        });                
    }
    
    var mknod_function = function(path, mode, dev, cb){
        console.log('mknod(%s)', path);
        mknod(pt.join(original_folder, path), mode, dev, function (err) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            }            
        });
    }
    
    var mkdir_function = function(path, mode, cb){
        console.log('mkdir(%s)', path);
        fs.mkdir(pt.join(original_folder, path), mode, function (err) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            } 
        });        
    }
    
    var unlink_function = function(path, cb){
        console.log('unlink(%s)', path);
        fs.unlink(pt.join(original_folder, path), function (err) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            } 
        });        
    }
    
    var rmdir_function = function(path, cb){
        console.log('rmdir(%s)', path);
        fs.rmdir(pt.join(original_folder, path), function (err) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            } 
        });                
    }
    
    var symlink_function = function(src, dest, cb){
        console.log('symlink(%s,%s)', src, dest);
        fs.symlink(pt.join(original_folder, src), pt.join(original_folder, dest), function (err) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            } 
        });        
    }
    
    var rename_function = function(src, dest, cb){
        console.log('rename(%s,%s)', src, dest);
        fs.rename(pt.join(original_folder, src), pt.join(original_folder, dest), function (err) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            } 
        });                
    }
    
    var link_function = function(src, dest, cb){
        console.log('link(%s,%s)', src, dest);
        fs.link(pt.join(original_folder, src), pt.join(original_folder, dest), function (err) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            } 
        });                        
    }
    
    var chmod_function = function(path, mode, cb){
        console.log('chmod(%s)', path);
        fs.chmod(pt.join(original_folder, path), mode, function (err) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            } 
        });                                
    }
    
    var chown_function = function(path, uid, gid, cb){
        console.log('chown(%s)', path);
        fs.chown(pt.join(original_folder, path), uid, gid, function (err) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            } 
        });        
    }
    
    var truncate_function = function(path, size, cb){
        console.log('truncate(%s)', path);
        fs.truncate(pt.join(original_folder, path), size, function (err) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            } 
        });        
    }
    
    var utimens_function = function(path, atime, mtime, cb){
        console.log('utimens(%s)', path);
        fs.utimes(pt.join(original_folder, path), atime, mtime, function (err) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(0);
            } 
        });        
    }
    
    var open_function = function(path, flags, cb){
        console.log('open(%s)', path);
        fs.open(pt.join(original_folder, path), flags, function (err, fd) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(null, fd);
            } 
        });        
    }
    
    var read_function = function(path, fd, buffer, length, position, cb){
        console.log('read(%s)', path);
        fs.open(pt.join(original_folder, path), 'r', function (err, int_fd) {
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                fs.read(int_fd, buffer, 0, length, position, function(err, bytesRead, int_buffer){
                    if(err){
                        //console.log('error: ', err);
                        cb(fuse[err.code]);
                    }
                    else{
                        buffer.copy(int_buffer);
                        fs.close(int_fd, function(err){
                            if(err){
                                //console.log('error:', err);
                                cb(fuse[err.code]);
                            }
                            else{
                                cb(bytesRead);
                            }
                        });
                    }
                });
            } 
        });        
    }
    
    var write_function = function(path, fd, buffer, length, position, cb){
        console.log('write(%s)', path);
        // getting value that was pushed
        inputstring = buffer.toString().trim();
        // trying to convert value to integer
        if (parseInt(inputstring)) {inputstring = parseInt(inputstring)}
        // checking if export folder is target
        if ((original_folder + path) == "/sys/class/gpio/export") {
            // return "ok"
            // correct return is not implemented yet
            cb(2);
            console.log("Export string: " + buffer.toString());
            console.log("Original folder: " + original_folder);
            //get container name from the path
            name = mirror_folder.match(/\/gpio_mnt\/(.*)\/sys\/class\/gpio/i)[1];
            console.log("Mirrored folder: " + mirror_folder);
            // checking for input. If it's number from 0 to 100, go on  
            if (inputstring >=0 && inputstring <= 100) {
              // check if pin is already exported
              if (fs.existsSync(`/sys/class/gpio/gpio${inputstring}`)){
                console.log (`pin ${inputstring} is exported already`);
	      } else {
                // if its not exported yet, export it
                gpio.export(inputstring, {
                  ready: function() {
                    // create folder for exported pin
                    mkdirp(`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`,function (err) {
                      if (err) {
                        console.error(`An error has occured while creating /gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} folder: ${err.message}`);
                      } else {
                        console.log (`Created /gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} folder successfully`);
                      }
                      // create folder for exported pin in container
                      exec(`lxc exec ${name} -- mkdir -p /gpio_mnt/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`, (error, stdout, stderr) => {
                        if (error) {
                          console.error(`An error has occured while creating /gpio_mnt/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} folder in ${name} container`);
                        } else {
                          console.log (`Created /gpio_mnt/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} folder in ${name} contaier`);
                        }

                        // create device to mount folder to container
                        exec(`lxc config device add ${name} pin${inputstring} disk source=/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} path=/gpio_mnt/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`, (error, stdout, stderr) => {
                          if (error) {
                            console.error(`An error has occured while mounting /gpio_mnt/sys/devices/platform/soc/3f200000.gpiogpio/gpio${inputstring} folder in ${name} container: ${error}`);
                          } else {
                            console.log (`Mounted /gpio_mnt/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} folder in ${name} container`);
                          }
                          // start mirroring using fuse
                          folderMirroring (`/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`, `/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`, [`uid=${uid}`,`gid=${gid}`,`allow_other`]);
                          //cb (null);
                        });
                      });
                    });
                  }
                });
              }
          // if user tries to put something wrong to export folder
          } else { 
             console.log('user tried to perform unexpected action');
          }
        // if user tries to unexport
        } else if ((original_folder + path) == "/sys/class/gpio/unexport") {
          // return "ok"
          // correct return is not implemented yet
          cb(2);
          console.log("Unexport string: " + buffer.toString());
          console.log("Original folder: " + original_folder);
          //get container name from the path
          name = mirror_folder.match(/\/gpio_mnt\/(.*)\/sys\/class\/gpio/i)[1];
          console.log("Mirrored folder: " + mirror_folder);
          // checking for input. If it's number from 0 to 100, go on
          if (inputstring >=0 && inputstring <= 100) {
            // check if pin exported to this container or not
            exec(`mount | grep "/dev/fuse on /gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} type fuse"`, (error, stdout, stderr) => {
              if (error) {
                // if not exported to this container - do not proceed
                console.error(`pin ${inputstring} is not exported to ${name} container yet. Cannot proceed with unexporting`);
              } else {
                // proceed this unexporting if exported to this container
                console.log (`Unexporting pin ${inputstring}...`);

                fuse.unmount(`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`, function (err) {
                  // this is callback function, which handles errors
                  if (err) {
                    console.error(`filesystem at /gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} not unmounted due to error: ${err}`);
                  } else {
                    console.log(`filesystem at /gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} has been unmounted`);
                  }
                  // try removing device from container
                  exec(`lxc config device remove ${name} pin${inputstring}`,(error, stdout, stderr) => {
                    if (error) {
                      console.error(`An error has occured while removing pin${inputstring} device in ${name} container: ${error}`);
                    } else {
                      console.log (`Removed ${inputstring} device from ${name} container`);
                    }
                    // remove folder from container
                    exec(`lxc exec ${name} -- rm -R /gpio_mnt/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`, (error, stdout, stderr) => {
                      if (error) {
                        console.error(`An error has occured while removing /gpio_mnt/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} folder in ${name} container`);
                      } else {
                        console.log (`removed /gpio_mnt/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} folder in ${name} contaier`);
                      }
                      // remove folder from physical raspberry
                      deleteFolderRecursive (`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`);
                      // unexport pin
                      gpio.unexport(inputstring, {
                        ready: function() {
                          //cb (2);
                        }
                      });
                    });
                  });
                });
              }
            });
          }
        } else {
          fs.open(pt.join(original_folder, path), 'r+', function (err, int_fd) {
              if(err){
                  //console.log('error: ', err);
                  cb(fuse[err.code]);
              }
              else{
                  fs.write(int_fd, buffer, 0, length, position, function(err, written, int_buffer){
                      if(err){
                           //console.log('error: ', err);
                         cb(fuse[err.code]);
                      }
                      else{
                          fs.close(int_fd, function(err){
                              if(err){
                                  //console.log('error:', err);
                                  cb(fuse[err.code]);
                              }
                              else{
                                  console.log (written);
                                  cb(written);
                              }
                          });
                      }
                  });
              } 
          });
        }
    }
    
    var getxattr_function = function(path, name, buffer, length, offset, cb){
        console.log('getxattr_function(%s)', path);
        fs.lstat(pt.join(original_folder, path), function(err, stats){
            if(err){
                console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                console.log('stats: ', stats);
                cb(null,stats);
            }
        });
        
    }
    
    var statfs_function = function(path, cb){
        console.log('statvfs(%s)', path);
        statvfs(pt.join(original_folder, path), function(err, stats){
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                cb(null,stats);
            }
        });
    }
    
   fuse.mount(mirror_folder, {
    getattr: getattr_function,
    access: access_function,
    readlink: readlink_function,
    readdir: readdir_function,
    mknod: mknod_function, //(not available in fs, using mknod module instead)
    mkdir: mkdir_function,
    unlink: unlink_function,
    rmdir: rmdir_function,
    symlink: symlink_function,
    rename: rename_function,
    link: link_function,
    chmod: chmod_function,
    chown: chown_function,
    truncate: truncate_function,
    utimens: utimens_function,
    open: open_function,
    read: read_function,
    write: write_function,
    statfs: statfs_function, //(not available in fs, using statvfs module instead)
    //setxattr: setxattr_function (not available in fs or other implementations)
    getxattr: getxattr_function, //(not available in fs or other implementations, using lstat instead)
    //listxattr: (not available in fuse-bindings)
    //removexattr: (not available in fuse-bindings)
    options: fuse_options
   });
}

// route invoked by POST method to /container path (i.e. http://server:port/container)
// req variable contains initial request came from client
// res variable answer to be sent to client
app.post('/container', function (req, res)  {
  // req.body is client request's body, which is in JSON format. It's beign automatically parsed by bodyParser.json()
  // req.body.name value is taken from parsed JSON and assigned to name variable in order to use it further
  name = req.body.name;
  // All console.log lines are added in debugging purposes
  console.log ("Request body: ", req.body);
  console.log(`Launching ${name} container...`);

  // there are few libraries to manage lxc directly from node.js, but they do not allow to configure containers
  // therefore we use exec, which invokes bash shell. 
  exec (`lxc launch ubuntu:16.04 ${name}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`An error has occured while launching container: ${error}`);
      // do not continue if container failed to launch
      return
    } else {
      console.log (`Launched ${name} container`);
      // go on if container launched successfully
      // taking uid of container's root using fs.statSync method
      uidstats = fs.statSync(`/var/lib/lxd/containers/${name}/rootfs/`);
      uid = uidstats["uid"];
      console.log ("UID: ", uid);

      // Adding gpio group to container.
      exec(`lxc exec ${name} -- addgroup gpio`, (error, stdout, stderr) => {
        if (error) {
          console.error(`An error has occured while adding gpio group: ${error}`);
        } else { console.log (`Added gpio group in ${name} container `);
        }
        setTimeout(function (){ 
          // without sleeping, it keeps failing with error: ubuntu user does not exist. 
          // This is due to the fact that the cloud-init script that creates the ubuntu user has not finished yet when you try to add the ubuntu user to the gpio group.
          // adding ubuntu user to gpio group in container
          exec(`lxc exec ${name} -- usermod -a -G gpio ubuntu`, (error, stdout, stderr) => { 
            if (error) {
               console.error(`An error has occured while adding ubuntu user to gpio group: ${error}`);
            } else {
               console.log (`Added ubuntu user to gpio group in ${name} container `);
            }
          });
        }, 15000);
        // getting gpio group's ID in containter and suming it with rootfs folder's uid. It will be used further while calling folder mirroring function
        output = (execSync('lxc exec ' + name + ' -- cat /etc/group')).toString();
        gid = parseInt(output.match(/gpio:x:([0-9]+):.*/i)[1]) + parseInt(uid);
        console.log ("GID: ", gid);
        // checking if /gpio_mnt/${name} exists and if not - create it using mkdirp.sync
        // standard fs.mkdirSync does not fit because there is no way to make folder recursively
        if (!fs.existsSync(`/gpio_mnt/${name}`)){
	  try {
	    mkdirp.sync(`/gpio_mnt/${name}`);
	  } catch (e) {
	    console.log ("Error: ", e.message);
	  }
	}
        
        // fs.chmod does not perform recursive chmod, therefore using exec + chmod with -R flag
        exec(`chmod 777 -R /gpio_mnt/`, (error, stdout, stderr) => {
          if (error) console.error(`An error has occured while performing chmod 777 -R /gpio_mnt/: ${error}`);
          else console.log (`Performed chmod 777 -R /gpio_mnt/ succesfully`);
          // creating folders using mkdirp.sync for pins mapping
          mkdirp(`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio`,function (err) {
            if (err) {
               console.error(`An error has occured while creating /gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio folder: ${err.message}`);
            } else {
               console.log (`Created /gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio folder successfully`);
            }
            mkdirp(`/gpio_mnt/${name}/sys/class/gpio`, function (err) {
              if (err) {
                console.error(`An error has occured while creating /gpio_mnt/${name}/sys/class/gpio folder: ${err.message}`);
              } else {
                console.log (`Created /gpio_mnt/${name}/sys/class/gpio folder successfully`);
              }
              // adding permissions to root&gpio
              wrench.chownSyncRecursive(`/gpio_mnt/${name}/sys/`, uid, gid);
              // creating folder in container, which will be mapped to parent's appropriate folder
              exec(`lxc exec ${name} -- mkdir -p /gpio_mnt/sys/class/gpio`,(error, stdout, stderr) => {
                if (error) {
                  console.error(`An error has occured while creating /gpio_mnt/sys/class/gpio folder in ${name} container`);
  	        } else {
                   console.log (`Created /gpio_mnt/sys/class/gpio folder in ${name} container`);
                }
                // creating folder in container, which will be mapped to parent's appropriate folder
                exec(`lxc exec ${name} -- mkdir -p /gpio_mnt/sys/devices/platform/soc/3f200000.gpio`, (error, stdout, stderr) => {
	          if (error) {
                    console.error(`An error has occured while creating /gpio_mnt/sys/devices/platform/soc/3f200000.gpio folder in ${name} container`);
	          } else {
                    console.log (`Created /gpio_mnt/sys/devices/platform/soc/3f200000.gpio folder in ${name} contaier`);
	          }
                  // mapping parent's folders to appropriate container's folders
		  exec(`lxc config device add ${name} gpio disk source=/gpio_mnt/${name}/sys/class/gpio path=/gpio_mnt/sys/class/gpio`, (error, stdout, stderr) => {
		    if (error) {
                      console.error(`An error has occured while mounting /gpio_mnt/sys/class/gpio folder in ${name} container`);
		    } else {
                      console.log (`Mounted /gpio_mnt/sys/class/gpio folder in ${name} container`);
		    } 
                    // mapping parent's folders to appropriate container's folders
		    //exec(`lxc config device add ${name} devices disk source=/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio path=/gpio_mnt/sys/devices/platform/soc/3f200000.gpio`, (error, stdout, stderr) => {
		      //if (error) {
                      //  console.error(`An error has occured while mounting /gpio_mnt/sys/devices/platform/soc/3f200000.gpio folder in ${name} container: ${error}`);
		      //} else {
                      //  console.log (`Mounted /gpio_mnt/sys/devices/platform/soc/3f200000.gpio folder in ${name} container`);
		      //}
                      // calling functions to reflect changes between parent and container's folders using FUSE
		      //folderMirroring (`/sys/devices/platform/soc/3f200000.gpio`, `/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio`, [`uid=${uid}`,`gid=${gid}`,`allow_other`]);
		    folderMirroring (`/sys/class/gpio`, `/gpio_mnt/${name}/sys/class/gpio`, [`uid=${uid}`,`gid=${gid}`,`allow_other`]);
		    //});
                  });
		});
              });
            });
          });
        });
      });
    }
  });
  // respond to client. Currenlty no logic, which tracks actual state of all pin mapping processes. Therefore, always answer "invoked"
  res.send(`invoked`);
});

// route invoked by DELETE method to /container path (i.e. http://server:port/container)
// req variable contains initial request came from client
// res variable answer to be sent to client
app.delete('/container', function (req, res) {
  // req.body is client request's body, which is in JSON format. It's beign automatically parsed by bodyParser.json()
  // req.body.name value is taken from parsed JSON and assigned to name variable in order to use it further
  name = req.body.name;
  // All console.log lines are added in debugging purposes
  console.log(name);
  // get all fuse mount points of this container in order to unmount them
  unmountAllFuse (name, function () {
      // continue in unnamed callback, in order to keep order of tasks. Otherwise, some tasks will be performed earlier than other.
      // for example, first we should unmount filesystem, and then remove lxc device from container, and not vise versa.

      // there are few libraries to manage lxc directly from node.js, but they do not allow to configure containers
      // therefore we use exes, which invokes bash shell.
      // by these 2 try constructions we reconfigre container and remove gpio mountings. Name is taken from client's JSON
      exec(`lxc config device remove ${name} gpio disk`,(error, stdout, stderr) => {
        if (error) {
          console.error(`An error has occured during gpio disk removal from ${name}: ${error}`);
        } else {
          console.log(`gpio disk was removed from ${name}`);
        }
        
          //recursively remove gpoi_mnt folder. There is no method in fs to recursively remove, therefore using deleteFolderRecursice function
          console.log(`removing /gpio_mnt/${name} folder...`);

          deleteFolderRecursive (`/gpio_mnt/${name}`);
          //remove container by bash
          console.log("Removing container...");
          exec(`lxc delete --force ${name}`,(error, stdout, stderr) => {
            if (error) {
              console.error(`An error has occured during ${name} removal: ${error}`);
            } else {
              console.log(`${name} was removed`);
            }
          });
        //});
      });    
  });
  // respond to client. Currenlty no logic, which tracks actual state of all pin mapping processes. Therefore, always answer "invoked"
  // answer comes immediately after receving API call 
  res.send("invoked");
});

// on start of server, checking for existence of running containers. If they exist, re-mount folders
client.containers(function(err, containers) {
  for (var i = 0; i < containers.length; i++) {
    if((containers[i]._metadata.status) == 'Running') {
      //Remounting
      name = containers[i].name();
      console.log (`${name} is running`);
      // taking uid of container's root using fs.statSync method
      uidstats = fs.statSync(`/var/lib/lxd/containers/${name}/rootfs/`);
      uid = uidstats["uid"];
      console.log ("UID: ", uid);
      // getting gpio group's ID in containter and suming it with rootfs folder's uid. It will be used further while calling folder mirroring function
      output = (execSync('lxc exec ' + name + ' -- cat /etc/group')).toString();
      gid = parseInt(output.match(/gpio:x:([0-9]+):.*/i)[1]) + parseInt(uid);
      console.log ("GID: ", gid);
      //calling function that was defined earlier
      folderRemount(`/sys/class/gpio`,name,uid,gid);
      //look for exported pins and remount their folders
      if (fs.existsSync(`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio`)){
        pinfolders = fs.readdirSync(`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio`);
        for (var j = 0; i < pinfolders.length; i++) {
          console.log (pinfolders[i]);
          folderRemount(`/sys/devices/platform/soc/3f200000.gpio/gpio/${pinfolders[i]}`,name,uid,gid);
        }
      }
    }
  }
});

// app.listen is used to launch web server for API requests listening
app.listen(port, () => {
  console.log('We are live on ' + port);
});

