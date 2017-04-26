var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var port = 8000;
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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }))


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


app.post('/container', function (req, res)  {
  name = req.body.name;
  console.log ("Request body: ", req.body);
  console.log(`Trying to launch ${name} container...`);
  try {
    execSync(`lxc launch ubuntu:16.04 ${name}`);
  } catch (e) {
    console.log ("An error has occured while launching container: ", e.message);
  } finally {
    console.log (`Launched ${name} container`);
  }

  uidstats = fs.statSync(`/var/lib/lxd/containers/${name}/rootfs/`);
  uid = uidstats["uid"];
  console.log ("UID: ", uid);


  try {
    var nowhere = execSync(`lxc exec ${name} -- addgroup gpio`);
  } catch (e) {
    console.log ("An error has occured while adding gpio group: ", e.message);
  } finally {
    console.log (`Added gpio group in ${name} container `);
  }
  try {
    var nowhere = execSync(`lxc exec ${name} -- usermod -a -G gpio ubuntu`);
   } catch (e) {
    console.log ("An error has occured while adding ubuntu user to gpio group: ", e.message);
  } finally {
    console.log (`Added ubuntu user to gpio group in ${name} container`);
  }

  output = (execSync('lxc exec ' + name + ' -- cat /etc/group')).toString();
  gid = parseInt(output.match(/gpio:x:([0-9]+):.*/i)[1]) + parseInt(uid);
  console.log ("GID: ", gid);
  if (!fs.existsSync(`/gpio_mnt`)){
    fs.mkdirSync(`/gpio_mnt`);
  }

  if (!fs.existsSync(`/gpio_mnt/${name}`)){
    fs.mkdirSync(`/gpio_mnt/${name}`);
  }
  //fs.chmodSync does not perform recursive chmod, therefore using mkdirp library 
  execSync(`chmod 777 /gpio_mnt/`); 
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


  var nowhere = execSync(`sudo chown ${uid}.${gid} -R /gpio_mnt/${name}/sys/`);
  try {
    var nowhere = execSync(`lxc exec ${name} -- mkdir -p /gpio_mnt/sys/class/gpio`);
  } catch (e) {
    console.log ("Error: ", e.message);
  }
  try {
    var nowhere = execSync(`lxc exec ${name} -- mkdir -p /gpio_mnt/sys/devices/platform/soc/3f200000.gpio`);
  } catch (e) {
    console.log ("Error: ", e.message);
  }

  try {
    var nowhere = execSync(`lxc config device add ${name} gpio disk source=/gpio_mnt/${name}/sys/class/gpio path=/gpio_mnt/sys/class/gpio`);
  } catch (e) {
    console.log ("Error: ", e.message);
  }
  try {
    var nowhere = execSync(`lxc config device add ${name} devices disk source=/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio path=/gpio_mnt/sys/devices/platform/soc/3f200000.gpio`);
  } catch (e) {
    console.log ("Error: ", e.message);
  }

  folderMirroring (`/sys/devices/platform/soc/3f200000.gpio`, `/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio`, `uid=${uid} gid=${gid} allow_other`);
  folderMirroring (`/sys/class/gpio`, `/gpio_mnt/${name}/sys/class/gpio`, `uid=${uid} gid=${gid} allow_other`);

  res.send(`ok`);
});

app.delete('/container', function (req, res) {
  name = req.body.name;
  console.log(name);

//  path1 = `/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio`
//  var mounted = mountutil.isMounted(`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio`,true);  
//  console.log (mounted.mounted);
//  if((mountutil.isMounted(`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio`,true)).mounted) {
//    console.log (`Trying to unmount ${path1}...`);
  var mountpoints = [`/gpio_mnt/${req.body.name}/sys/devices/platform/soc/3f200000.gpio`,`/gpio_mnt/${req.body.name}/sys/class/gpio`];
  mountpoints.forEach (function(mountPath,i,mountpoints) {
    console.log (mountPath);
    fuse.unmount(mountPath, function (err) {
      if (err) {
        console.log('filesystem at ' + mountPath + ' not unmounted', err)
      } else {
        console.log('filesystem at ' + mountPath + ' unmounted')
     }
    });
  });

//unmount devices
   

   
//    try {
//      execSync(`umount ${mountpoint}`)
//    } catch (e) {
//      console.log(`An error has occured during ${mountpoint} mountpoint removal: ${e.error}`);
//    } finally {    
//      console.log(`Successfully unmounted ${mountpoint} mountpoint`);
//   }
//       /*mountutil.umount(mountpoint, false, { "removeDir": true }, function(result) {
//        if (result.error) {
//          console.log('Error during ' + mountpoint + 'unmounting:'  + result.error);
//        } else {
//	  console.log(`successfully unmounted ${mountpoint}`);
//        }
//        });*/  
//  });  

  //remove lxc container devices
  console.log("11");
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
  //remove gpoi_mnt folder for container
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
  try {
    execSync(`rm -rf /gpio_mnt/${name}`);
  } catch (e) {
     console.log(`An error has occured during /gpio_mnt/${name} folder removal: ${e.error}`);
  } finally {
    console.log(`/gpio_mnt/${name} folder was removed`);
  }


  //remove container
  console.log("Removing container...");
  try {
    execSync(`lxc delete --force ${name}`);
  } catch (e){
    console.log(`An error has occured during ${name} removal: ${e.message}`);
  } finally {
     console.log(`${name} was removed`);
  }
  res.send("ok");
});

app.listen(port, () => {
  console.log('We are live on ' + port);
});

