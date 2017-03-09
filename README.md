# Raspberry Pi Virtualization
An approach to create multiple virtual Raspberry Pis on a single physical one through the use of LXD and FUSE. The virtual Raspberry Pis need to have access to the GPIO pseudo-filesystem. Of course, priviledged LXD containers could directly access the filesystem without the need of FUSE. However, being able to mediate access to GPIO pins is of great interest in Internet of Things and Fog/Edge computing scenarios. 

## HowTo
This is a first version of Raspberry Pi virtualization: full pass-through of GPIO folder. It has been tested on a Raspberry Pi 2 with Ubuntu 16.04 LTS downloaded from https://wiki.ubuntu.com/ARM/RaspberryPi.

###Upgrade the system
```
sudo apt update
sudo apt upgrade -y
sudo sh -c "echo '127.0.0.1 ubuntu' >> /etc/hosts"
sudo reboot
```

###Install dependencies
```
sudo apt install -y fuse libfuse-dev pkg-config python2.7
curl -sL https://deb.nodesource.com/setup_7.x | sudo -E bash -
sudo apt install -y nodejs
```

###Create a folder for testing and setup the Node.js dependencies
```
mkdir /home/ubuntu/test_gpio_mirroring
cd /home/ubuntu/test_gpio_mirroring
npm config set python `which python2.7`
npm install fuse-bindings fs mknod path minimist
npm install https://github.com/PlayNetwork/node-statvfs/tarball/v3.0.0
wget https://raw.githubusercontent.com/flongo82/node-folder-mirroring/master/node-folder-mirroring.js
```

###Install and configure LXD
```
sudo add-apt-repository -y  ppa:ubuntu-lxc/lxd-stable
sudo apt-get update
sudo apt-get install -y lxd lxd-tools criu cgmanager
sudo apt-get install -y zfs
lxd --version
sudo reboot
sudo lxd init
```

###Configure the system to allow gpio folder to be accessible from ubuntu user
```
sudo addgroup gpio
sudo usermod -a -G gpio ubuntu
cat<<EOF | sudo tee /etc/udev/rules.d/99-gpio.rules
SUBSYSTEM=="input", GROUP="input", MODE="0660"
SUBSYSTEM=="i2c-dev", GROUP="i2c", MODE="0660"
SUBSYSTEM=="spidev", GROUP="spi", MODE="0660"
SUBSYSTEM=="bcm2835-gpiomem", GROUP="gpio", MODE="0660"

SUBSYSTEM=="gpio*", PROGRAM="/bin/sh -c '\\
chown -R root:gpio /sys/class/gpio && chmod -R 770 /sys/class/gpio;\\
chown -R root:gpio /sys/devices/virtual/gpio && chmod -R 770 /sys/devices/virtual/gpio;\\
chown -R root:gpio /sys\$devpath && chmod -R 770 /sys\$devpath\\
'"

KERNEL=="ttyAMA[01]", PROGRAM="/bin/sh -c '\\
ALIASES=/proc/device-tree/aliases; \\
if cmp -s \$ALIASES/uart0 \$ALIASES/serial0; then \\
echo 0;\\
elif cmp -s \$ALIASES/uart0 \$ALIASES/serial1; then \\
echo 1; \\
else \\
exit 1; \\
fi\\
'", SYMLINK+="serial%c"

KERNEL=="ttyS0", PROGRAM="/bin/sh -c '\\
ALIASES=/proc/device-tree/aliases; \\
if cmp -s \$ALIASES/uart1 \$ALIASES/serial0; then \\
echo 0; \\
elif cmp -s \$ALIASES/uart1 \$ALIASES/serial1; then \\
echo 1; \\
else \\
exit 1; \\
fi \\
'", SYMLINK+="serial%c"
EOF
sudo reboot
```

###Launch a virtual Raspberry Pi
```
lxc launch ubuntu:16.04 test1

MYUID=`sudo ls -l /var/lib/lxd/containers/test1/rootfs/ | grep root | awk '{}{print $3}{}'`

lxc exec test1 -- addgroup gpio
lxc exec test1 -- usermod -a -G gpio ubuntu
MYGID=$(($MYUID + `lxc exec test1 -- sed -nr "s/^gpio:x:([0-9]+):.*/\1/p" /etc/group`))

sudo mkdir -p /gpio_mnt/test1
sudo chmod 777 -R /gpio_mnt/

sudo mkdir -p /gpio_mnt/test1/sys/devices/platform/soc/3f200000.gpio
sudo mkdir -p /gpio_mnt/test1/sys/class/gpio
sudo chown "$MYUID"."$MYGID" -R /gpio_mnt/test1/sys/

lxc exec test1 -- mkdir -p /gpio_mnt/sys/class/gpio
lxc exec test1 -- mkdir -p /gpio_mnt/sys/devices/platform/soc/3f200000.gpio

lxc config device add test1 gpio disk source=/gpio_mnt/test1/sys/class/gpio path=/gpio_mnt/sys/class/gpio
lxc config device add test1 devices disk source=/gpio_mnt/test1/sys/devices/platform/soc/3f200000.gpio path=/gpio_mnt/sys/devices/platform/soc/3f200000.gpio

cd /home/ubuntu/test_gpio_mirroring/
sudo node node-folder-mirroring.js /sys/devices/platform/soc/3f200000.gpio /gpio_mnt/test1/sys/devices/platform/soc/3f200000.gpio -o uid=$MYUID -o gid=$MYGID -o allow_other &> log_devices_test1 &
sudo node node-folder-mirroring.js /sys/class/gpio /gpio_mnt/test1/sys/class/gpio -o uid=$MYUID -o gid=$MYGID -o allow_other &> log_gpio_test1 &
```

##Current issues and future features
* Understand if it is possible to mount the mirrored GPIO pseudo-filesystem under the /sys folder in a virtual rasp;
* Forward hardware interrupt to the virtual GPIO pseudo-filesystem, i.e., implement poll() syscall on top of FUSE;
* Design a mechanism to map physical pins with virtual pins in terms of naming, filtering, and so on. 
