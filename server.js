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
var jsonfile = require('jsonfile')
// using bodyParster.json in order to parse JSON strings
app.use(bodyParser.json());
// using bodyParser.urlenconded - without it express module won't be able to understand x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }))
// specifying port number on which application will be listening
var port = 8000;

var type = (function(global) {
    var cache = {};
    return function(obj) {
        var key;
        return obj === null ? 'null' // null
            : obj === global ? 'global' // window in browser or global in nodejs
            : (key = typeof obj) !== 'object' ? key // basic: string, boolean, number, undefined, function
            : obj.nodeType ? 'object' // DOM element
            : cache[key = ({}).toString.call(obj)] // cached. date, regexp, error, object, array, math
            || (cache[key] = key.slice(8, -1).toLowerCase()); // get XXXX from [object XXXX], and cache it
    };
}(this));
// this function is desired to simplify remounts during server initialization
function folderRemount (original_folder, mirrored_folder, uid, gid) {
  fuse.unmount(mirrored_folder, function (err) {
    // this is callback function, which handles errors
    if (err) {
      console.error(`filesystem at ${mirrored_folder} not unmounted due to error: ${err}`);
    } else {
      console.log(`filesystem at ${mirrored_folder} has been unmounted`);
    }
    
    folderMirroring (original_folder, mirrored_folder, [`uid=${uid}`,`gid=${gid}`,`allow_other`]);
  });
}

var findOne = function (haystack, arr) {
    return arr.some(function (v) {
        return haystack.indexOf(v) >= 0;
    });
};

// this function is used to filter array
function customFilter(values) {
   return function(r) {
      var keys = Object.keys( values );
      var answer = true;

      for( var i = 0, len = keys.length; i < len; i++) {
          if( r[keys[i]] !== values[keys[i]] ) {
              answer = false;
              break;
          }
      }

      return answer;
   }
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
        // if trying to get attributes of /sys/class/gpio/gpiox
        if (original_folder == "/sys/class/gpio" && /\/gpio\d{1,2}/i.test(path) ) {
          //get container name from the path
          name = mirror_folder.match(/\/gpio_mnt\/(.*)\/sys\/class\/gpio/i)[1];
          // getting json file with pin mapping rules
          virtualpin = (path.match(/\/gpio(\d{1,2})/i))[1]
          jsonfile.readFile(`${pt.dirname(require.main.filename)}/exported_pins.json`, function (err, obj) {
            // if file was not read, do not continue
            if (err) {
              console.log(`An error has occured during ${pt.dirname(require.main.filename)}/exported_pins.json file reading.`);
              fs.lstat(pt.join(original_folder, path), function(err, stats){
                if(err){
                  //console.log('error: ', err);
                  cb(fuse[err.code]);
                }
                else{
                  cb(null,stats);
                }
              });
            } else {
              // get pins related to this container
              filteredpin = obj.filter (function(o){
                return (o.virtual == virtualpin && o.name == name);
              });
              // if this is emulated pin, then change destination file to fake one (just to get its attributes)
              if (filteredpin[0].physical == 'Emulated'){
                path = `${pt.dirname(require.main.filename)}/linkforemulation`
              } else { 
                path = `${original_folder}/gpio${filteredpin[0].physical}`
              }
              console.log (`Getting attr for path ${path}`)
              // return the attributes
              fs.lstat(path, function(err, stats){
                if(err){
                  //console.log('error: ', err);
                  cb(fuse[err.code]);
                }
                else{
                  cb(null,stats);
                }
              });
            }
          });
        } else {
          fs.lstat(pt.join(original_folder, path), function(err, stats){
            if(err){
                //console.log('error: ', err);                
                cb(fuse[err.code]);
            }
            else{
                console.log(`getting ${path} attributes`)
                cb(null,stats);
            }
          });
        }
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
        // if trying to get attributes of /sys/class/gpio/gpiox
        if (original_folder == "/sys/class/gpio" && /\/gpio\d{1,2}/i.test(path) ) {
          //get container name from the path
          name = mirror_folder.match(/\/gpio_mnt\/(.*)\/sys\/class\/gpio/i)[1];
          // getting json file with pin mapping rules
          virtualpin = (path.match(/\/gpio(\d{1,2})/i))[1]
          jsonfile.readFile(`${pt.dirname(require.main.filename)}/exported_pins.json`, function (err, obj) {
            // if file was not read, continue with original path
            if (err) {
              console.log(`An error has occured during ${pt.dirname(require.main.filename)}/exported_pins.json file reading.`);
              // return link for original path
              fs.readlink(pt.join(original_folder, path), function(err, linkString){
                if(err){
                  //console.log('error: ', err);
                  cb(fuse[err.code]);
                }
                else{
                  cb(null, linkString);
                }
              });
            } else {
              // get pins related to this container
              filteredpin = obj.filter (function(o){
                return (o.virtual == virtualpin && o.name == name);
              });
              // return fixed link if this is emulated pin
              if (filteredpin[0].physical == 'Emulated'){
                cb (null, `../../devices/platform/soc/3f200000.gpio/gpio/gpio${virtualpin}`)
              } else {
              // get real link if this is forwarded pin
                path = `${original_folder}/gpio${filteredpin[0].physical}`
                fs.readlink(path, function(err, linkString){
                  if(err){
                    //console.log('error: ', err);
                    cb(fuse[err.code]);
                  }
                  else{
                    cb(null, linkString);
                  }
                });
              }
            }
          });
        } else {
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
    }
    
    var readdir_function = function(path, cb){
        console.log('readdir(%s)', path);
        fs.readdir(pt.join(original_folder, path), function(err, files){
            if(err){
                //console.log('error: ', err);
                cb(fuse[err.code]);
            }
            else{
                // if trying to list /sys/class/gpio contents
                if ((original_folder + path) == "/sys/class/gpio/") {
                    //get container name from the path
                    name = mirror_folder.match(/\/gpio_mnt\/(.*)\/sys\/class\/gpio/i)[1];
                    // initially create new files variable with export and unexport only. Will be filling it with exported pins below
                    var files = [];
                    files.push('export');
                    files.push('unexport');

                    // getting json file with pin exports
                    jsonfile.readFile(`${pt.dirname(require.main.filename)}/exported_pins.json`, function (err, obj) {
                      // if file was not read, continue with original files list
                      if (err) {
                        console.log(`An error has occured during ${pt.dirname(require.main.filename)}/exported_pins.json file reading.`);
                        cb(null,files);
                      } else {
                        // get pins related to this container
                        filteredpins = obj.filter (function(o){
                          return (o.name === name);
                        });
                        // go through list of pin in exported_pins and add to output
                        for(var k = 0; k < filteredpins.length; k++) {
                          if (filteredpins[k].physical == 'Emulated') {
                            files.push (`gpio${filteredpins[k].virtual}`)
                          } else {
                            files.push (`gpio${filteredpins[k].physical}`)
                          }
                        }
                        //return list of files 
                        console.log(`retunring list of contents: ${files}`)
                        cb(null,files);
                      }
                    });
                } else {
                    console.log(`retunring list of contents: ${files}`)
                    cb(null,files);
                }
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
            // checking for input. If it's number from 1 to 40, go on  
            if (inputstring >= 1 && inputstring <= 40) {
              // create array in order to add it no exported_pins.json
              exportobject = new Object()
              exportobject.name = name
              exportobject.virtual = inputstring.toString()
              // getting json file with pin mapping rules
              fs.readFile(`${pt.dirname(require.main.filename)}/pin_mapping_${name}.json`, function (err, contents) { 
                // if file was not read, do not continue
                if (err) {
                  console.log(`An error has occured during ${pt.dirname(require.main.filename)}/pin_mapping_${name}.json file reading. Cannot continue with exporting.`);
                } else {
                  // find if pin has any rule.
                  rules = JSON.parse(contents);
                  filteredrules = rules.filter (function(o){
                    return (o.virtual === inputstring.toString());
                  });
                  if (filteredrules.length == 1) {
                    // rule exists for pin
                    physicalpin = filteredrules[0].physical
                    pinfolder = `/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`
                    // check if pin is already exported if not - do it
                    if (fs.existsSync(`/sys/class/gpio/gpio${physicalpin}`)){
                      console.log (`Pin ${physicalpin} is exported already. Skipping export of physical pin`);
      	            } else {
                      // if its not exported yet, export it
                      gpio.export(physicalpin, {
                        ready: function() {
                        }
                      });
                    }
                    // set the last attribute of table to be exported to exported_pins.json
                    exportobject.physical = physicalpin
                    // try reading exported_pins.json in order to append it with currently exported ping
                    jsonfile.readFile(`${pt.dirname(require.main.filename)}/exported_pins.json`, function (err, obj) {
                      if (err) {
                        console.log (`Could not read exported_pin.json ${err}`)
                        jsonfile.writeFile(`${pt.dirname(require.main.filename)}/exported_pins.json`, exportobject, function (err) {
                          console.error(err)
                        });
                        // write new version of exported_pins.json with currently exported pin
                      } else {
                        obj.push (exportobject);
                        jsonfile.writeFile(`${pt.dirname(require.main.filename)}/exported_pins.json`, obj, function (err) {
                          console.error(err)
                        });
                      }
                    });
                  } else {
                    // no rule for pin
                    pinfolder = `/gpio_mnt/${name}/emulatedpins/gpio${inputstring}`
                    // set the last attribute of table to be exported to exported_pins.json
                    exportobject.physical = `Emulated`
                    // try reading exported_pins.json in order to append it with currently exported ping
                    jsonfile.readFile(`${pt.dirname(require.main.filename)}/exported_pins.json`, function (err, obj) {
                      if (err) {
                        console.log (`Could not read exported_pin.json ${err}`)
                        jsonfile.writeFile(`${pt.dirname(require.main.filename)}/exported_pins.json`, exportobject, function (err) {
                          console.error(err)
                        });
                        // write new version of exported_pins.json with currently exported pin
                      } else {
                        obj.push (exportobject);
                        jsonfile.writeFile(`${pt.dirname(require.main.filename)}/exported_pins.json`, obj, function (err) {
                          console.error(err)
                        });
                      }
                    });
                    // create emulated folder sturcture
                    mkdirp(`${pinfolder}/power`,function (err) {
                      if (err) {
                        console.error(`An error has occured while creating ${pinfolder} folder: ${err.message}`);
                      } else {
                        console.log (`Created ${pinfolder} folder successfully`);
                      }
                      fs.symlink('../../../../../../class/gpio',`${pinfolder}/subsystem`, function (err,data) { });
                      fs.symlink('../../../3f200000.gpio',`${pinfolder}/device`, function (err,data) { });
                      // get folder structude from file
                      jsonfile.readFile(`${pt.dirname(require.main.filename)}/gpio_folder_structure.json`, function (err, obj) {
                        if (!err){
                          // create files and set permissions to them
                          for (var i = 0; i < obj.length; i++) {
                            console.log (obj[i])
                            fs.writeFileSync(`${pinfolder}/${obj[i].file}`,`${obj[i].defaultvalue}\n`);
                            fs.chmod(`${pinfolder}/${obj[i].file}`,0770,function(err,temp){});
                          }  
                        } else {
                          console.log(err)
                        }
                      });
                        
                    });
                  }
                  // create folder for pin
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
                      exec(`lxc config device add ${name} pin${inputstring} disk source=${pinfolder} path=/gpio_mnt/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`, (error, stdout, stderr) => {
                        if (error) {
                          console.error(`An error has occured while mounting /gpio_mnt/sys/devices/platform/soc/3f200000.gpiogpio/gpio${inputstring} folder in ${name} container: ${error}`);
                        } else {
                          console.log (`Mounted /gpio_mnt/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring} folder in ${name} container`);
                        }
                        // start mirroring using fuse
                        folderMirroring (pinfolder, `/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`, [`uid=${uid}`,`gid=${gid}`,`allow_other`]);
                        //cb (null);
                      });
                    });
                  });
                }
              });  
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
          if (inputstring >= 1 && inputstring <= 40) {
            //find this pin's physical pin or find out that it's emulated
            jsonfile.readFile(`${pt.dirname(require.main.filename)}/exported_pins.json`, function (err, obj) {
              if (!err) {
                console.log (obj)
                // remove from list of exported pins the one which was unexported currently
                for(var k = obj.length - 1; k >= 0; k--) {
                  if (obj[k].name == name && obj[k].virtual == inputstring.toString()){
                    physicalpin = obj[k].physical;
                    obj.splice(k, 1);
                  }
                }
                // write to file last removal
                jsonfile.writeFileSync(`${pt.dirname(require.main.filename)}/exported_pins.json`, obj);
                if (physicalpin == `Emulated`){
                  physicalpath = `/gpio_mnt/${name}/emulatedpins/gpio${inputstring}`
                } else {
                  physicalpath = `/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`
                }               
                virtualpath = `/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${inputstring}`
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
                      deleteFolderRecursive (physicalpath);
                      //if no containers this this pin, proceed this unexporting it from physical rasp
                      filteredpins = obj.filter (function(o){
                        return (o.physical === physicalpin);
                      });
                      if (!(filteredpins.length >= 1) && !(physicalpin == `Emulated`)) {
                        gpio.unexport(physicalpin, {
                          ready: function() {
                            console.log(`unexported pin ${physicalpin}`)
                            //cb (2);
                          }
                        });
                      }
                    });
                  });
                });
              } else {
                console.log (`Virtual pin ${inputstring} in ${name} containter was not found it exported_pins.json. This can happen if it is not exported by containter`)
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
                //console.log('stats: ', stats);
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
  if (!(name == undefined)) {
  //check whether gpiomapping section exists in the request and process it if yes
  if (req.body.gpiomapping) {
    // check if pin mapping file exists for container. If yes - don't perform any actions
    if (!fs.existsSync(`${pt.dirname(require.main.filename)}/pin_mapping_${name}.json`)) {
      fs.writeFile(`${pt.dirname(require.main.filename)}/pin_mapping_${name}.json`,JSON.stringify(req.body.gpiomapping),function(err){
        if(err) {
           throw err;
        } else {
           console.log (`GPIO mapping was saved to ping_mapping_${name}.json file`)
           console.log (req.body.gpiomapping)
        }
      })
    } else {
      console.log (`${name}.json already exsists! Possibly, containter is running already`)
    }
  } else {
    console.log (`GPIO mapping does not exist in request.`)
  }
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
          // creating folder using mkdirp.sync for physical pins mapping
          mkdirp(`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio`,function (err) {
            if (err) {
               console.error(`An error has occured while creating /gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio folder: ${err.message}`);
            } else {
               console.log (`Created /gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio folder successfully`);
            }
          });
          // creating folder using mkdirp.sync for emulated pins storing
          mkdirp(`/gpio_mnt/${name}/emulatedpins`,function (err) {
            if (err) {
               console.error(`An error has occured while creating /gpio_mnt/${name}/emulatedpins folder: ${err.message}`);
            } else {
               console.log (`Created /gpio_mnt/${name}/emulatedpins folder successfully`);
            }
          });  
          // creating folder in container, which will be mapped to parent's appropriate folder
          exec(`lxc exec ${name} -- mkdir -p /gpio_mnt/sys/devices/platform/soc/3f200000.gpio`, (error, stdout, stderr) => {
            if (error) {
              console.error(`An error has occured while creating /gpio_mnt/sys/devices/platform/soc/3f200000.gpio folder in ${name} container`);
            } else {
              console.log (`Created /gpio_mnt/sys/devices/platform/soc/3f200000.gpio folder in ${name} contaier`);
            }
          });
          // creating folder for /sys/class/gpio mapping
          mkdirp(`/gpio_mnt/${name}/sys/class/gpio`, function (err) {
            if (err) {
              console.error(`An error has occured while creating /gpio_mnt/${name}/sys/class/gpio folder: ${err.message}`);
            } else {
              console.log (`Created /gpio_mnt/${name}/sys/class/gpio folder successfully`);
            }
            // adding permissions to root&gpio
            wrench.chownSyncRecursive(`/gpio_mnt/${name}/`, uid, gid);
            // creating folder in container, which will be mapped to parent's appropriate folder
            exec(`lxc exec ${name} -- mkdir -p /gpio_mnt/sys/class/gpio`,(error, stdout, stderr) => {
              if (error) {
                console.error(`An error has occured while creating /gpio_mnt/sys/class/gpio folder in ${name} container`);
	        } else {
                 console.log (`Created /gpio_mnt/sys/class/gpio folder in ${name} container`);
              }
              // mapping parent's folders to appropriate container's folders
	      exec(`lxc config device add ${name} gpio disk source=/gpio_mnt/${name}/sys/class/gpio path=/gpio_mnt/sys/class/gpio`, (error, stdout, stderr) => {
	        if (error) {
                  console.error(`An error has occured while mounting /gpio_mnt/sys/class/gpio folder in ${name} container`);
		} else {
                  console.log (`Mounted /gpio_mnt/sys/class/gpio folder in ${name} container`);
		} 
		folderMirroring (`/sys/class/gpio`, `/gpio_mnt/${name}/sys/class/gpio`, [`uid=${uid}`,`gid=${gid}`,`allow_other`]);
              });
            });
          });
        });
      });
    }
  });
  }
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
            // check if there is pin_mapping file for this containter. If exist - remove it
            if (fs.existsSync(`${pt.dirname(require.main.filename)}/pin_mapping_${name}.json`)) {
              console.log (`removing ${pt.dirname(require.main.filename)}/pin_mapping_${name}.json file...`)
              fs.unlinkSync(`${pt.dirname(require.main.filename)}/pin_mapping_${name}.json`)
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
      folderRemount(`/sys/class/gpio`,`/gpio_mnt/${name}/sys/class/gpio`,uid,gid);
      if (fs.existsSync(`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio`)){
        fs.readdir(`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio`, function (err, pinfolders) {
          if (pinfolders.length) {
            // get list of exported pins for all containters
            jsonfile.readFile(`${pt.dirname(require.main.filename)}/exported_pins.json`, function (err, obj) {
              if (!err) {
                for (var j = 0; j < pinfolders.length; j++) {
                  //get pin number from gpioxx
                  console.log (`Pin folder: ${pinfolders[j]}`)
                  if (!((pinfolders[j].match(/\/gpio(\d{1,2})/i)) == null)){
                    virtualpin = (pinfolders[j].match(/\/gpio(\d{1,2})/i))[1]
                    // check current pin it's emulated
                    filteredpins = obj.filter (function(o){
                      return (o.name === name && o.virtual === virtualpin && o.physical === "Emulated");
                    });
                    console.log (pinfolders[j]);
                    if (filteredpins.length >= 1) {
                      //emulated
                      console.log (`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${virtualpin} is mapped to emulated pin`);
                      folderRemount(`/gpio_mnt/${name}/emulatedpins/${pinfolders[j]}`,`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/${pinfolders[j]}`,uid,gid);
                    } else {
                      console.log (`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/gpio${virtualpin} is mapped to physical pin`);
                      folderRemount(`/sys/devices/platform/soc/3f200000.gpio/gpio/${pinfolders[j]}`,`/gpio_mnt/${name}/sys/devices/platform/soc/3f200000.gpio/gpio/${pinfolders[j]}`,uid,gid);
                    }
                  }
                }
              }
            });
          }
        });
      }
    }
  }
});

// check pin_mapping_name.json files to find the ones which should not exist
glob(`${pt.dirname(require.main.filename)}/pin_mapping_*.json`, function(err,files) {
  //if any file exists
  if(files.length){
    //iterate through the array of files
    for (var j = 0; j < files.length; j++) {
      file_path = files [j];
      //get container name from path
      container_name = (files[j].match(/\/pin_mapping_(.*)\.json/i))[1]
      //get containter with appropriate name
      client.container(container_name, function(err, container) {
        // if containter is not in running state or it does not exist, remove the file
        if (!(container._metadata.status == 'Running')) {
          console.log (`Removing ${file_path} file...`);
          fs.unlinkSync(file_path)
        }
      })
    }
  }
});


// app.listen is used to launch web server for API requests listening
app.listen(port, () => {
  console.log('We are live on ' + port);
});

