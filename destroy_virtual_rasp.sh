#!/bin/bash

if [ "$#" -ne 1 ]; then
    echo "Usage: destroy_virtual_rasp.sh <virtual_rasp_name>"
    exit;
fi

name=$1
echo "Destroying virtual rasp "$name"!"

sudo kill -9 `cat /home/ubuntu/test_gpio_mirroring/log_devices_pid_"$name"`
sudo kill -9 `cat /home/ubuntu/test_gpio_mirroring/log_gpio_pid_"$name"`
sudo rm /home/ubuntu/test_gpio_mirroring/log_*_"$name"

sudo umount /gpio_mnt/"$name"/sys/devices/platform/soc/3f200000.gpio
sudo umount /gpio_mnt/"$name"/sys/class/gpio

lxc config device remove "$name" gpio disk 
lxc config device remove "$name" devices disk

sudo rm -rf /gpio_mnt/"$name"

lxc delete --force $name
