// express is used to handle API routes
var express = require('express');
var bodyParser = require('body-parser');
// via app variable we'll be using express module
var app = express();
var fs = require('fs');
var glob = require('glob');
var ps = require('ps-node');
var mountutil = require('linux-mountutils');
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var pt = require('path');
var statvfs = require('statvfs');
var mknod = require('mknod');
var argv = require('minimist')(process.argv.slice(2));
var fuse = require('fuse-bindings');
var mkdirp = require('mkdirp');
// using bodyParster.json in order to parse JSON strings
app.use(bodyParser.json());
// using bodyParser.urlenconded - without it express module won't be able to understand x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }))
// specifying port number on which application will be listening
var port = 8000;

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
                                cb(written);
                            }
                        });
                    }
                });
            } 
        });        

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
  console.log(`Trying to launch ${name} container...`);
  // using try construction where it is possible in order to make code more reliable
  try {
    // there are few libraries to manage lxc directly from node.js, but they do not allow to configure containers
    // therefore we use exesSync, which invokes bash shell. 
    // execSync is synchronous exec - difference is that execSync waits for command to finish, while exec does not
    // if we use exec, all further code will be invoked before container actually starts
    // by this line we launch container. Name is taken from client's JSON
    execSync(`lxc launch ubuntu:16.04 ${name}`);
  } catch (e) {
    console.log ("An error has occured while launching container: ", e.message);
  } finally {
    console.log (`Launched ${name} container`);
  }

  // taking uid of file's owner using fs.statSync method
  uidstats = fs.statSync(`/var/lib/lxd/containers/${name}/rootfs/`);
  uid = uidstats["uid"];
  console.log ("UID: ", uid);


  try {
    // Adding gpio group to container.
    execSync(`lxc exec ${name} -- addgroup gpio`);
  } catch (e) {
    console.log ("An error has occured while adding gpio group: ", e.message);
  } finally {
    console.log (`Added gpio group in ${name} container `);
  }
  try {
    // adding ubuntu user to gpio group in container
    execSync(`lxc exec ${name} -- usermod -a -G gpio ubuntu`);
   } catch (e) {
    console.log ("An error has occured while adding ubuntu user to gpio group: ", e.message);
  } finally {
    console.log (`Added ubuntu user to gpio group in ${name} container`);
  }
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
  // fs.chmodSync does not perform recursive chmod, therefore using execSync + chmod with -R flag
  execSync(`chmod 777 -R /gpio_mnt/`);
  // creating folders using mkdirp.sync for pins mapping
  try {
    mkdirp.sync(`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio`);
  } catch (e) {
    console.log ("Error: ", e.message);
  }
  try {
    mkdirp.sync(`/gpio_mnt/${name}/sys/class/gpio`);
   } catch (e) {
    console.log ("Error: ", e.message);
  }
  // there is no fs.chown with recursion - using execSync + chown -R
  execSync(`chown ${uid}.${gid} -R /gpio_mnt/${name}/sys/`);
  // creating folder in container, which will be mapped to parent's appropriate folder
  try {
    execSync(`lxc exec ${name} -- mkdir -p /gpio_mnt/sys/class/gpio`);
  } catch (e) {
    console.log ("Error: ", e.message);
  }
  // creating folder in container, which will be mapped to parent's appropriate folder
  try {
    execSync(`lxc exec ${name} -- mkdir -p /gpio_mnt/sys/devices/platform/soc/3f200000.gpio`);
  } catch (e) {
    console.log ("Error: ", e.message);
  }
  // mapping parent's folders to appropriate container's folders
  try {
    execSync(`lxc config device add ${name} gpio disk source=/gpio_mnt/${name}/sys/class/gpio path=/gpio_mnt/sys/class/gpio`);
  } catch (e) {
    console.log ("Error: ", e.message);
  }
  // mapping parent's folders to appropriate container's folders
  try {
    execSync(`lxc config device add ${name} devices disk source=/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio path=/gpio_mnt/sys/devices/platform/soc/3f200000.gpio`);
  } catch (e) {
    console.log ("Error: ", e.message);
  }
  // calling functions to reflect changes between parent and container's folders using FUSE
  folderMirroring (`/sys/devices/platform/soc/3f200000.gpio`, `/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio`, `uid=${uid} gid=${gid} allow_other`);
  folderMirroring (`/sys/class/gpio`, `/gpio_mnt/${name}/sys/class/gpio`, `uid=${uid} gid=${gid} allow_other`);
  // respond to client. Currenlty no logic, which tracks actual state of all pin mapping processes. Therefore, always answer "ok"
  res.send(`ok`);
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
  // creating array with list of mounting points to unmount, in order to simplify code
  var mountpoints = [`/gpio_mnt/${req.body.name}/sys/devices/platform/soc/3f200000.gpio`,`/gpio_mnt/${req.body.name}/sys/class/gpio`];
  // using forEach() method in order to go through all array elements and unmount them
  mountpoints.forEach (function(mountPath,i,mountpoints) {
    console.log (mountPath);
    // using fuse.unmount(), which actually removes FUSE mounting
    fuse.unmount(mountPath, function (err) {
      // this is callback function, which handles errors
      if (err) {
        console.log('filesystem at ' + mountPath + ' not unmounted', err)
      } else {
        console.log('filesystem at ' + mountPath + ' unmounted')
     }
    });
  });

  // there are few libraries to manage lxc directly from node.js, but they do not allow to configure containers
  // therefore we use exesSync, which invokes bash shell.
  // execSync is synchronous exec - difference is that execSync waits for command to finish, while exec does not
  // if we use exec, all further code will be invoked before container actually starts
  // by these 2 try constructions we reconfigre container and remove gpio mountings. Name is taken from client's JSON
  try {
    execSync(`lxc config device remove ${name} gpio disk`)
  } catch (e) {
     console.log(`An error has occured during gpio disk removal from ${name}: ${e.error}`);
  } finally {
    console.log(`gpio disk was removed from ${name}`);
  }

  try {
    execSync(`lxc config device remove ${name} devices disk`)
  } catch (e) {
    console.log(`An error has occured during disk removal from ${name}: ${e.error}`);
  } finally {
    console.log(`disk was removed from ${name}`);
  } 
  //recursively remove gpoi_mnt folder. There is no method in fs to recursively remove, therefore using deleteFolderRecursice function
  var path = "/gpio_mnt/" + name;
  console.log(`removing ${path} folder...`);
  
  var deleteFolderRecursive = function(path) {
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

  //remove container by bash
  console.log("Removing container...");
  try {
    execSync(`lxc delete --force ${name}`);
  } catch (e){
    console.log(`An error has occured during ${name} removal: ${e.message}`);
  } finally {
     console.log(`${name} was removed`);
  }
  // respond to client. Currenlty no logic, which tracks actual state of all pin mapping processes. Therefore, always answer "ok"
  res.send("ok");
});

// app.listen is used to launch web server for API requests listening
app.listen(port, () => {
  console.log('We are live on ' + port);
});

