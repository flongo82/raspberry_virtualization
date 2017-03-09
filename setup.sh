#!/bin/bash

echo "127.0.0.1" >> /etc/hosts

sudo apt install -y fuse libfuse-dev pkg-config python2.7
curl -sL https://deb.nodesource.com/setup_7.x | sudo -E bash -
sudo apt install -y nodejs

mkdir /home/ubuntu/test_gpio_mirroring
cd /home/ubuntu/test_gpio_mirroring
npm config set python `which python2.7`
npm install fuse-bindings fs mknod path minimist
npm install https://github.com/PlayNetwork/node-statvfs/tarball/v3.0.0
wget https://raw.githubusercontent.com/flongo82/node-folder-mirroring/master/node-folder-mirroring.js

sudo add-apt-repository -y ppa:ubuntu-lxc/lxd-stable
sudo apt-get update
sudo apt-get install -y lxd criu cgmanager
sudo apt-get install -y zfsutils-linux
sudo lxd init
lxd --version

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

echo "Setup completed. Please, reboot!"
