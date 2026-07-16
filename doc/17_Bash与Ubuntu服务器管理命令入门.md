# Bash 与 Ubuntu 服务器管理命令入门

本文面向完全没有 Bash 和 Ubuntu/Linux 命令行基础，但希望能部署项目、管理服务器的人。

你可以把它当作一份“从零开始的命令行速查手册”。它不会覆盖 Linux 的全部知识，但会优先讲清楚部署项目、查看状态、排查问题、管理服务时最常用、最应该掌握的命令。

## 1. 先理解：Bash、终端、Ubuntu 命令是什么关系

很多初学者会把“终端”“Bash”“Linux 命令”“Ubuntu 命令”混在一起。它们确实经常一起出现，但不是同一个东西。

### 1.1 终端 Terminal

终端是一个输入和显示命令的窗口。

例如你通过 SSH 登录服务器后看到的黑色命令行界面，就是终端环境。

### 1.2 Shell

Shell 是命令解释器。它负责接收你输入的文字，解析后执行对应程序。

常见 Shell：

```bash
bash
zsh
sh
fish
```

Ubuntu 默认常见的是 Bash。

### 1.3 Bash

Bash 是一种 Shell。它既可以执行普通命令，也有自己的语法，比如变量、管道、重定向、条件判断、循环、脚本等。

例如：

```bash
cd /var/log
ls -lh
cat nginx/access.log | grep 500
```

这些命令通常是在 Bash 里运行的。

### 1.4 Ubuntu/Linux 命令

很多命令不是 Bash 自己提供的，而是系统里的程序。Bash 只是帮你调用它们。

例如：

```bash
apt
systemctl
nginx
node
git
mysql
```

可以这样理解：

```text
终端 = 输入和显示命令的窗口
Bash = 解析命令的工具
Ubuntu/Linux 命令 = Bash 可以调用的系统程序
```

会 Bash 不等于会所有 Ubuntu 命令，但会 Bash 是使用 Ubuntu 服务器的基础。

## 2. 命令的基本结构

Linux 命令通常长这样：

```bash
命令 [选项] [参数]
```

英文里经常叫：

```bash
command [options] [arguments]
```

例如：

```bash
ls -lh /var/log
```

含义：

```text
ls       命令，列出文件
-lh      选项，控制显示方式
/var/log 参数，指定要查看的目录
```

再看一个服务器管理命令：

```bash
sudo systemctl restart nginx
```

结构是：

```text
sudo      以管理员权限执行后面的命令
systemctl 服务管理命令
restart   子命令，表示重启
nginx     参数，服务名
```

### 2.1 命令区分大小写

Linux 命令和路径大多区分大小写：

```bash
ls
LS
```

这两个不是一回事。通常命令都是小写。

文件名也区分大小写：

```text
app.js
App.js
APP.js
```

这三个在 Linux 里是三个不同文件。

### 2.2 空格很重要

命令、选项、参数之间用空格分隔。

正确：

```bash
ls -l /home
```

错误：

```bash
ls-l/home
```

### 2.3 短选项与长选项

短选项通常是一个横线：

```bash
ls -l
```

长选项通常是两个横线：

```bash
ls --all
```

多个短选项有时可以合并：

```bash
ls -l -h -a
ls -lha
```

这两条常常等价。

### 2.4 参数的位置

有些命令的参数顺序很重要。

例如复制文件：

```bash
cp 源文件 目标位置
```

例子：

```bash
cp app.js app.backup.js
```

含义是把 `app.js` 复制成 `app.backup.js`。

如果写反了，意义就变了。

### 2.5 `$` 和 `#` 提示符

你在教程里可能会看到：

```bash
$ ls
# apt update
```

通常：

```text
$ 表示普通用户命令提示符
# 表示 root 管理员用户命令提示符
```

输入命令时不要把 `$` 或 `#` 也复制进去。

### 2.6 一条命令太长时如何换行

Bash 里可以用反斜杠 `\` 把一条命令拆成多行：

```bash
sudo apt install \
  nginx \
  git \
  curl
```

等价于：

```bash
sudo apt install nginx git curl
```

注意：反斜杠后面不要再加空格。

## 3. 获取帮助：不会用命令时先查什么

### 3.1 `--help`

大多数命令支持：

```bash
命令 --help
```

例如：

```bash
ls --help
cp --help
systemctl --help
```

适合快速查看参数。

### 3.2 `man`

`man` 是 manual 的缩写，查看命令手册：

```bash
man ls
man chmod
man systemctl
```

进入手册后常用操作：

```text
方向键 / PageUp / PageDown  翻页
/关键词                      搜索
n                            下一个搜索结果
q                            退出
```

### 3.3 `which`、`type`、`command -v`

查看命令位置：

```bash
which node
which nginx
```

查看命令到底是什么：

```bash
type cd
type ls
type sudo
```

更适合脚本里判断命令是否存在：

```bash
command -v git
command -v node
```

## 4. 路径基础

服务器管理离不开路径。

### 4.1 根目录 `/`

Linux 文件系统从 `/` 开始。

常见目录：

```text
/home        普通用户家目录
/root        root 用户家目录
/etc         系统和软件配置
/var         日志、缓存、运行数据
/var/log     系统和服务日志
/usr         系统软件
/opt         可选安装软件
/tmp         临时文件
/srv         服务数据
```

### 4.2 家目录 `~`

`~` 表示当前用户的家目录。

例如你当前是 `fee` 用户：

```bash
cd ~
```

通常等价于：

```bash
cd /home/fee
```

### 4.3 当前目录 `.` 与上级目录 `..`

```bash
.   当前目录
..  上级目录
```

例子：

```bash
cd .
cd ..
```

运行当前目录下的脚本时，常见写法：

```bash
./deploy.sh
```

这里的 `./` 表示“当前目录下的”。

### 4.4 绝对路径与相对路径

绝对路径从 `/` 开始：

```bash
/var/log/nginx/access.log
```

相对路径基于当前所在目录：

```bash
logs/app.log
../config/app.env
```

查看当前目录：

```bash
pwd
```

重要习惯：执行删除、移动、部署命令前，先运行 `pwd` 确认自己在哪里。

## 5. 基础导航与查看命令

### 5.1 `pwd`：查看当前目录

```bash
pwd
```

输出示例：

```text
/home/fee/app
```

### 5.2 `ls`：列出文件

```bash
ls
```

常用：

```bash
ls -l
ls -lh
ls -la
ls -lah
```

含义：

```text
-l  长格式显示
-h  human readable，以 KB/MB/GB 显示大小
-a  显示隐藏文件
```

常用组合：

```bash
ls -lah
```

隐藏文件以 `.` 开头，例如：

```text
.env
.gitignore
.bashrc
```

### 5.3 `cd`：切换目录

```bash
cd /var/log
cd ~
cd ..
cd -
```

含义：

```text
cd /var/log  进入 /var/log
cd ~         回到当前用户家目录
cd ..        回到上级目录
cd -         回到上一次所在目录
```

### 5.4 `clear`：清屏

```bash
clear
```

只清理显示，不会删除文件。

### 5.5 `history`：查看历史命令

```bash
history
```

执行历史中的第 100 条命令：

```bash
!100
```

重新执行上一条命令：

```bash
!!
```

如果上一条命令忘了加 sudo：

```bash
sudo !!
```

这在服务器管理中非常常用。

## 6. 文件和目录操作

### 6.1 `touch`：创建空文件或更新时间

```bash
touch app.log
```

如果文件不存在，创建它；如果存在，更新它的修改时间。

### 6.2 `mkdir`：创建目录

```bash
mkdir logs
```

递归创建多级目录：

```bash
mkdir -p /home/fee/app/logs
```

`-p` 的作用是：中间目录不存在也一起创建，已存在也不报错。

### 6.3 `cp`：复制文件或目录

复制文件：

```bash
cp app.js app.backup.js
```

复制到目录：

```bash
cp app.js /tmp/
```

复制目录：

```bash
cp -r app app_backup
```

常用参数：

```text
-r  递归复制目录
-v  显示复制过程
-a  归档模式，尽量保留权限、时间等信息
```

部署前备份配置文件常用：

```bash
sudo cp -a /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
```

### 6.4 `mv`：移动或重命名

重命名：

```bash
mv old.txt new.txt
```

移动到目录：

```bash
mv app.log /var/log/myapp/
```

注意：`mv` 没有回收站概念。如果目标文件已存在，可能会覆盖。

可以加 `-i` 让覆盖前询问：

```bash
mv -i old.txt new.txt
```

### 6.5 `rm`：删除文件或目录

删除文件：

```bash
rm app.log
```

删除目录：

```bash
rm -r logs
```

强制删除：

```bash
rm -f app.log
```

递归强制删除：

```bash
rm -rf logs
```

`rm -rf` 非常危险。它不会进回收站，删错了通常很难恢复。

执行这类命令前建议：

```bash
pwd
ls -lah
```

确认位置和目标。

尤其不要运行类似：

```bash
rm -rf /
rm -rf /*
rm -rf $SOME_VAR/*
```

第三种危险在于变量可能为空，导致实际删除范围扩大。脚本里一定要格外小心。

### 6.6 `rmdir`：删除空目录

```bash
rmdir empty_dir
```

只能删除空目录。实际使用频率不如 `rm -r` 高，但更安全。

### 6.7 `ln`：创建链接

创建软链接：

```bash
ln -s /opt/app/current /var/www/app
```

软链接可以理解为快捷方式。

查看链接：

```bash
ls -l
```

常见用途：

```bash
sudo ln -s /etc/nginx/sites-available/myapp.conf /etc/nginx/sites-enabled/myapp.conf
```

这在 Nginx 配置中很常见。

### 6.8 `file`：查看文件类型

```bash
file app.log
file archive.tar.gz
```

它会告诉你文件大概是什么类型。

### 6.9 `stat`：查看文件详细信息

```bash
stat app.js
```

可以看到大小、权限、所属用户、修改时间等。

## 7. 查看文件内容

### 7.1 `cat`：输出整个文件

```bash
cat app.log
```

适合查看小文件。

不适合直接查看超大日志，因为会刷屏。

### 7.2 `less`：分页查看文件

```bash
less app.log
```

常用操作：

```text
空格/PageDown  下一页
b/PageUp       上一页
/关键词        搜索
n              下一个搜索结果
q              退出
```

查看大日志推荐用 `less`。

### 7.3 `head`：查看文件开头

```bash
head app.log
head -n 50 app.log
```

`-n 50` 表示看前 50 行。

### 7.4 `tail`：查看文件末尾

```bash
tail app.log
tail -n 100 app.log
```

实时跟踪日志：

```bash
tail -f app.log
```

部署和排查问题时非常常用。

例如：

```bash
sudo tail -f /var/log/nginx/error.log
```

退出实时跟踪：

```text
Ctrl + C
```

### 7.5 `grep`：搜索文本

搜索文件中的关键词：

```bash
grep "error" app.log
```

忽略大小写：

```bash
grep -i "error" app.log
```

显示行号：

```bash
grep -n "error" app.log
```

递归搜索目录：

```bash
grep -r "listen" /etc/nginx
```

排除不匹配的行：

```bash
grep -v "debug" app.log
```

组合使用：

```bash
grep -rin "server_name" /etc/nginx
```

含义：

```text
-r  递归
-i  忽略大小写
-n  显示行号
```

### 7.6 `wc`：统计行数、字数、字节数

```bash
wc app.log
wc -l app.log
```

`wc -l` 常用于统计行数。

### 7.7 `diff`：比较文件差异

```bash
diff old.conf new.conf
```

查看两个配置文件哪里不同。

## 8. 管道与重定向

管道和重定向是 Bash 的核心能力。它们让你把多个命令组合起来。

### 8.1 标准输入、标准输出、标准错误

Linux 命令通常有三条“流”：

```text
stdin   标准输入，编号 0
stdout  标准输出，编号 1
stderr  标准错误，编号 2
```

普通结果走 stdout，错误信息走 stderr。

### 8.2 `|`：管道

管道把前一个命令的输出交给后一个命令处理。

例子：

```bash
cat app.log | grep "error"
```

含义：先输出 `app.log`，再从输出中筛选包含 `error` 的行。

更常见可以直接写：

```bash
grep "error" app.log
```

但管道在组合多个命令时很有用：

```bash
ps aux | grep node
```

含义：列出所有进程，再找包含 `node` 的行。

### 8.3 `>`：覆盖写入文件

```bash
echo "hello" > hello.txt
```

如果 `hello.txt` 已存在，会被覆盖。

### 8.4 `>>`：追加写入文件

```bash
echo "hello" >> hello.txt
```

不会覆盖原文件，而是在末尾追加。

### 8.5 `2>`：重定向错误输出

```bash
command 2> error.log
```

把错误信息写入 `error.log`。

### 8.6 `2>&1`：把错误输出合并到普通输出

```bash
command > all.log 2>&1
```

含义：普通输出和错误输出都写入 `all.log`。

### 8.7 `tee`：一边显示一边写文件

```bash
command | tee output.log
```

追加写入：

```bash
command | tee -a output.log
```

修改系统文件时经常看到：

```bash
echo "text" | sudo tee /etc/example.conf
```

原因是普通的 `sudo echo "text" > /etc/example.conf` 往往不符合预期，因为 `>` 重定向由当前 Shell 执行，不一定有 sudo 权限。

## 9. 命令连接符

### 9.1 `;`：无论前面成功失败，都继续执行

```bash
cd /tmp; ls
```

### 9.2 `&&`：前面成功才执行后面

```bash
npm install && npm run build
```

只有 `npm install` 成功，才会运行 `npm run build`。

部署脚本里常用 `&&`，因为失败时可以停止后续操作。

### 9.3 `||`：前面失败才执行后面

```bash
systemctl is-active nginx || sudo systemctl start nginx
```

含义：如果 nginx 不是运行状态，就启动它。

### 9.4 `Ctrl + C`：中断当前命令

例如 `tail -f`、`ping`、开发服务器一直运行时，可以按：

```text
Ctrl + C
```

停止当前前台命令。

## 10. Bash 变量与环境变量

### 10.1 普通变量

```bash
NAME=fee
echo $NAME
```

注意等号两边不能有空格。

正确：

```bash
NAME=fee
```

错误：

```bash
NAME = fee
```

### 10.2 环境变量

环境变量可以被当前 Shell 启动的子进程读取。

```bash
export NODE_ENV=production
node app.js
```

临时给单条命令设置环境变量：

```bash
NODE_ENV=production node app.js
```

常见环境变量：

```text
PATH        命令搜索路径
HOME        当前用户家目录
USER        当前用户名
SHELL       当前 Shell
PWD         当前目录
NODE_ENV    Node.js 常用运行环境变量
```

查看：

```bash
echo $PATH
env
printenv
```

### 10.3 `.bashrc` 与 `source`

`~/.bashrc` 是 Bash 的常用配置文件。

修改后让它立即生效：

```bash
source ~/.bashrc
```

或：

```bash
. ~/.bashrc
```

两者基本等价。

## 11. 引号与转义

### 11.1 不加引号

```bash
echo hello world
```

空格会被当作参数分隔。

### 11.2 单引号

单引号里的内容基本原样输出，不解析变量：

```bash
NAME=fee
echo '$NAME'
```

输出：

```text
$NAME
```

### 11.3 双引号

双引号会保留整体，但会解析变量：

```bash
NAME=fee
echo "$NAME"
```

输出：

```text
fee
```

建议：路径或变量可能包含空格时，用双引号包住。

```bash
cd "$APP_DIR"
```

### 11.4 反斜杠转义

```bash
echo \"hello\"
```

输出：

```text
"hello"
```

## 12. 权限管理

权限是 Linux 服务器管理最重要的基础之一。

### 12.1 `ls -l` 看权限

```bash
ls -l app.js
```

示例：

```text
-rw-r--r-- 1 fee fee 1024 Jul 16 12:00 app.js
```

拆解：

```text
-           文件类型，- 表示普通文件，d 表示目录
rw-         所有者权限
r--         所属组权限
r--         其他人权限
fee         所有者
fee         所属组
1024        文件大小
Jul 16...   修改时间
app.js      文件名
```

权限字母：

```text
r  read，读
w  write，写
x  execute，执行
```

对文件：

```text
r  可以读取内容
w  可以修改内容
x  可以作为程序/脚本执行
```

对目录：

```text
r  可以列出目录内容
w  可以在目录内创建、删除、重命名文件
x  可以进入目录
```

目录的 `x` 很重要。没有 `x`，即使有 `r`，很多操作也无法进行。

### 12.2 `chmod`：修改权限

给脚本增加执行权限：

```bash
chmod +x deploy.sh
```

数字权限：

```text
r = 4
w = 2
x = 1
```

常见组合：

```text
7 = rwx
6 = rw-
5 = r-x
4 = r--
```

例如：

```bash
chmod 644 app.js
chmod 755 deploy.sh
chmod -R 755 /var/www/myapp
```

含义：

```text
644  所有者可读写，其他人只读
755  所有者可读写执行，其他人可读和执行
```

谨慎使用：

```bash
chmod -R 777 some_dir
```

`777` 表示所有人都可以读、写、执行，安全风险很高。部署项目时不要把“权限不够”简单粗暴地用 `777` 解决。

### 12.3 `chown`：修改所有者

```bash
sudo chown fee:fee app.js
```

递归修改目录所有者：

```bash
sudo chown -R fee:fee /home/fee/app
```

格式：

```bash
chown 用户:用户组 文件或目录
```

常见场景：项目目录应该归部署用户所有，而不是 root。

### 12.4 `chgrp`：修改所属组

```bash
sudo chgrp www-data app.log
```

使用频率比 `chown` 低一些。

## 13. 用户、用户组与 sudo

### 13.1 查看当前用户

```bash
whoami
id
```

`id` 会显示用户 ID、组 ID、所在用户组。

### 13.2 创建用户

Ubuntu/Debian 常用：

```bash
sudo adduser fee
```

它会创建用户、家目录，并提示设置密码。

更底层的命令是：

```bash
sudo useradd -m fee
sudo passwd fee
```

初学 Ubuntu 优先用 `adduser`。

### 13.3 给用户 sudo 权限

```bash
sudo usermod -aG sudo fee
```

参数：

```text
-a  append，追加
-G  指定附加组
sudo 允许执行 sudo 的用户组
fee  用户名
```

`-a` 很重要。不要漏掉，否则可能覆盖用户原来的附加组。

用户加入 sudo 组后，通常需要重新登录才完全生效。

测试：

```bash
su - fee
sudo whoami
```

如果输出：

```text
root
```

说明 sudo 可用。

### 13.4 `sudo`：以管理员权限执行

```bash
sudo apt update
sudo systemctl restart nginx
```

`sudo` 只让后面的这一条命令以管理员权限执行。

### 13.5 `su - 用户名`：切换用户

```bash
su - fee
```

`-` 表示加载目标用户的完整登录环境。

退出：

```bash
exit
```

### 13.6 root 用户

root 是最高权限用户。

建议：

```text
日常登录使用普通用户
需要管理员权限时使用 sudo
不要长期直接用 root 操作项目文件
```

这样可以降低误删、误改系统文件的风险。

## 14. 软件包管理：apt

Ubuntu 使用 `apt` 管理软件包。

### 14.1 更新软件包索引

```bash
sudo apt update
```

这不是升级软件，而是刷新“软件列表”。

通常安装软件前先运行它。

### 14.2 升级已安装软件

```bash
sudo apt upgrade
```

会升级系统中可升级的软件包。

### 14.3 安装软件

```bash
sudo apt install nginx
sudo apt install git curl vim
```

可以一次安装多个。

### 14.4 删除软件

删除软件但保留配置：

```bash
sudo apt remove nginx
```

删除软件并删除配置：

```bash
sudo apt purge nginx
```

清理不再需要的依赖：

```bash
sudo apt autoremove
```

### 14.5 搜索软件

```bash
apt search nginx
```

### 14.6 查看软件信息

```bash
apt show nginx
```

### 14.7 查看已安装软件

```bash
apt list --installed
```

搭配 grep：

```bash
apt list --installed | grep nginx
```

## 15. 服务管理：systemctl

Ubuntu 服务器通常用 systemd 管理服务，对应命令是 `systemctl`。

常见服务：

```text
nginx
mysql
redis-server
ssh
docker
```

### 15.1 查看服务状态

```bash
sudo systemctl status nginx
```

状态里重点看：

```text
Active: active (running)  正在运行
Active: inactive          未运行
Active: failed            启动失败
```

退出状态页：

```text
q
```

### 15.2 启动服务

```bash
sudo systemctl start nginx
```

### 15.3 停止服务

```bash
sudo systemctl stop nginx
```

### 15.4 重启服务

```bash
sudo systemctl restart nginx
```

### 15.5 重新加载配置

```bash
sudo systemctl reload nginx
```

如果服务支持 reload，它会在不中断服务或尽量少中断的情况下重新加载配置。

Nginx 修改配置后常用：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` 用来测试配置是否正确。配置正确再 reload。

### 15.6 设置开机自启

```bash
sudo systemctl enable nginx
```

取消开机自启：

```bash
sudo systemctl disable nginx
```

查看是否开机自启：

```bash
systemctl is-enabled nginx
```

### 15.7 查看失败服务

```bash
systemctl --failed
```

服务器异常时很有用。

## 16. 日志管理：journalctl 与常见日志目录

### 16.1 `journalctl` 查看 systemd 日志

查看某服务日志：

```bash
sudo journalctl -u nginx
```

实时跟踪：

```bash
sudo journalctl -u nginx -f
```

查看最近 100 行：

```bash
sudo journalctl -u nginx -n 100
```

查看今天的日志：

```bash
sudo journalctl -u nginx --since today
```

查看某个时间之后：

```bash
sudo journalctl -u nginx --since "2026-07-16 10:00:00"
```

### 16.2 常见日志目录

```text
/var/log/syslog           系统日志，Ubuntu 常见
/var/log/auth.log         登录、sudo、认证相关日志
/var/log/nginx/access.log Nginx 访问日志
/var/log/nginx/error.log  Nginx 错误日志
```

常用查看：

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -n 100 /var/log/syslog
sudo grep "Failed password" /var/log/auth.log
```

## 17. 进程管理

### 17.1 `ps`：查看进程

```bash
ps
ps aux
```

查找 node 进程：

```bash
ps aux | grep node
```

常见列：

```text
USER  启动进程的用户
PID   进程 ID
%CPU  CPU 占用
%MEM  内存占用
COMMAND 启动命令
```

### 17.2 `top`：实时查看系统资源

```bash
top
```

退出：

```text
q
```

如果安装了 htop，体验更好：

```bash
sudo apt install htop
htop
```

### 17.3 `kill`：结束进程

```bash
kill PID
```

例如：

```bash
kill 12345
```

强制结束：

```bash
kill -9 12345
```

优先尝试普通 `kill`，不要一上来就 `kill -9`。`-9` 会强制杀掉进程，进程没有机会做清理工作。

### 17.4 `pgrep` 与 `pkill`

按名称查找进程：

```bash
pgrep -a node
```

按名称结束进程：

```bash
pkill node
```

谨慎使用 `pkill`，因为它可能匹配多个进程。

### 17.5 后台运行、jobs、fg、bg

把命令放后台运行：

```bash
long_command &
```

查看当前 Shell 的后台任务：

```bash
jobs
```

把后台任务切回前台：

```bash
fg %1
```

暂停前台任务：

```text
Ctrl + Z
```

让暂停的任务在后台继续：

```bash
bg %1
```

### 17.6 `nohup`：退出终端后继续运行

```bash
nohup node app.js > app.log 2>&1 &
```

不过正式部署 Node.js 服务时，更推荐使用 systemd、PM2 或容器，而不是只靠 `nohup`。

## 18. 网络命令

### 18.1 `ip addr`：查看 IP 地址

```bash
ip addr
```

简写：

```bash
ip a
```

查看路由：

```bash
ip route
```

### 18.2 `ping`：测试网络连通性

```bash
ping 8.8.8.8
ping example.com
```

停止：

```text
Ctrl + C
```

### 18.3 `curl`：发 HTTP 请求

查看网页/API 返回：

```bash
curl http://localhost:3000
```

只看响应头：

```bash
curl -I http://localhost:3000
```

发送 POST：

```bash
curl -X POST http://localhost:3000/api/login
```

带 JSON：

```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

部署后检查服务是否可访问时，`curl` 非常常用。

### 18.4 `wget`：下载文件

```bash
wget https://example.com/file.tar.gz
```

有些最小系统没有预装，可用 apt 安装：

```bash
sudo apt install wget
```

### 18.5 `ss`：查看端口监听

查看正在监听的 TCP/UDP 端口：

```bash
sudo ss -tulpen
```

常用：

```bash
sudo ss -tulpn
```

含义：

```text
-t  TCP
-u  UDP
-l  listening，只看监听端口
-p  显示进程
-n  不解析名称，直接显示数字端口
-e  显示更多信息
```

查看 80 端口：

```bash
sudo ss -tulpn | grep ":80"
```

查看 Node.js 常见端口：

```bash
sudo ss -tulpn | grep ":3000"
```

### 18.6 `hostname`：查看或设置主机名

查看：

```bash
hostname
hostnamectl
```

设置主机名：

```bash
sudo hostnamectl set-hostname my-server
```

### 18.7 DNS 查询：`dig` 与 `nslookup`

安装：

```bash
sudo apt install dnsutils
```

查询域名：

```bash
dig example.com
nslookup example.com
```

部署域名解析时常用。

## 19. 防火墙：ufw

Ubuntu 常用简单防火墙工具是 `ufw`。

### 19.1 查看状态

```bash
sudo ufw status
sudo ufw status numbered
```

### 19.2 允许 SSH

启用防火墙前，先确保允许 SSH，否则可能把自己挡在服务器外面：

```bash
sudo ufw allow OpenSSH
```

或：

```bash
sudo ufw allow 22/tcp
```

### 19.3 允许 HTTP/HTTPS

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 19.4 开启防火墙

```bash
sudo ufw enable
```

### 19.5 删除规则

先查看编号：

```bash
sudo ufw status numbered
```

删除第 2 条：

```bash
sudo ufw delete 2
```

## 20. 磁盘、内存与系统状态

### 20.1 `df`：查看磁盘空间

```bash
df -h
```

重点看：

```text
Filesystem  Size  Used  Avail  Use%  Mounted on
```

`Use%` 接近 100% 时要清理磁盘，否则服务可能写不了日志、数据库可能异常。

### 20.2 `du`：查看目录占用

```bash
du -sh /var/log
du -h --max-depth=1 /var
```

常用于找大目录。

### 20.3 `free`：查看内存

```bash
free -h
```

### 20.4 `uptime`：查看运行时间与负载

```bash
uptime
```

输出中常见：

```text
load average: 0.10, 0.20, 0.15
```

分别表示过去 1 分钟、5 分钟、15 分钟的系统负载。

### 20.5 `lsblk`：查看磁盘设备

```bash
lsblk
```

查看磁盘、分区、挂载点。

### 20.6 `mount` 与 `umount`

挂载磁盘或目录：

```bash
sudo mount /dev/sdb1 /mnt/data
```

卸载：

```bash
sudo umount /mnt/data
```

磁盘挂载属于较高风险操作，生产服务器上操作前要确认设备名和挂载点。

## 21. 压缩与解压

### 21.1 tar.gz

打包压缩：

```bash
tar -czf app.tar.gz app/
```

解压：

```bash
tar -xzf app.tar.gz
```

查看压缩包内容：

```bash
tar -tzf app.tar.gz
```

参数含义：

```text
-c  create，创建
-x  extract，解压
-t  list，列出内容
-z  gzip
-f  file，指定文件
-v  verbose，显示过程
```

常见带过程显示：

```bash
tar -czvf app.tar.gz app/
tar -xzvf app.tar.gz
```

### 21.2 zip/unzip

安装：

```bash
sudo apt install zip unzip
```

压缩：

```bash
zip -r app.zip app/
```

解压：

```bash
unzip app.zip
```

## 22. SSH 远程登录与文件传输

### 22.1 SSH 登录

```bash
ssh 用户名@服务器IP
```

例子：

```bash
ssh fee@192.168.1.10
```

指定端口：

```bash
ssh -p 2222 fee@192.168.1.10
```

### 22.2 生成 SSH 密钥

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

一路回车即可使用默认路径。

常见公钥位置：

```bash
~/.ssh/id_ed25519.pub
```

私钥位置：

```bash
~/.ssh/id_ed25519
```

私钥不要泄露。

### 22.3 上传公钥到服务器

如果有 `ssh-copy-id`：

```bash
ssh-copy-id fee@服务器IP
```

之后就可以免密码登录。

### 22.4 scp 复制文件

本地复制到服务器：

```bash
scp app.tar.gz fee@服务器IP:/home/fee/
```

服务器复制到本地：

```bash
scp fee@服务器IP:/home/fee/app.log .
```

指定端口：

```bash
scp -P 2222 app.tar.gz fee@服务器IP:/home/fee/
```

注意：`ssh` 使用小写 `-p` 指定端口，`scp` 使用大写 `-P` 指定端口。

### 22.5 rsync 同步目录

```bash
rsync -avz ./app/ fee@服务器IP:/home/fee/app/
```

常用参数：

```text
-a  归档模式
-v  显示过程
-z  压缩传输
```

带删除同步：

```bash
rsync -avz --delete ./app/ fee@服务器IP:/home/fee/app/
```

`--delete` 会删除目标端多余文件，使用前确认路径。

## 23. Git 常用命令

部署项目常常离不开 Git。

### 23.1 克隆仓库

```bash
git clone https://github.com/example/app.git
```

进入项目：

```bash
cd app
```

### 23.2 查看状态

```bash
git status
git status --short
```

### 23.3 拉取最新代码

```bash
git pull
```

指定分支：

```bash
git pull origin main
```

### 23.4 查看分支

```bash
git branch
git branch -a
```

切换分支：

```bash
git checkout main
```

新版本 Git 也可以：

```bash
git switch main
```

### 23.5 查看提交记录

```bash
git log --oneline --decorate -n 10
```

### 23.6 部署前确认代码

常用检查：

```bash
git status --short
git branch
git log --oneline -n 3
```

这能帮助你确认：

```text
当前有没有未提交改动
当前在哪个分支
当前代码到了哪个提交
```

## 24. 编辑文件：nano 与 vim

### 24.1 nano

初学者更容易上手：

```bash
nano app.env
```

常用：

```text
Ctrl + O  保存
Enter     确认文件名
Ctrl + X  退出
Ctrl + W  搜索
```

### 24.2 vim

```bash
vim app.env
```

基本操作：

```text
i        进入插入模式
Esc      回到普通模式
:w       保存
:q       退出
:wq      保存并退出
:q!      不保存强制退出
/keyword 搜索
```

如果你完全不会 vim，先用 nano 更省心。

## 25. 定时任务：cron

### 25.1 编辑当前用户定时任务

```bash
crontab -e
```

查看：

```bash
crontab -l
```

### 25.2 cron 时间格式

```text
分钟 小时 日期 月份 星期 命令
```

例子：每天凌晨 2 点执行备份：

```cron
0 2 * * * /home/fee/backup.sh
```

每 5 分钟执行一次：

```cron
*/5 * * * * /home/fee/check.sh
```

### 25.3 cron 注意事项

cron 的环境变量通常比你手动登录时少，所以建议：

```text
命令尽量写绝对路径
脚本里设置必要环境变量
日志重定向到文件
```

例子：

```cron
*/5 * * * * /home/fee/check.sh >> /home/fee/check.log 2>&1
```

## 26. Nginx 常用命令

Nginx 是部署 Web 项目时常见的反向代理和静态资源服务器。

### 26.1 测试配置

```bash
sudo nginx -t
```

修改配置后，先测试，再 reload。

### 26.2 重新加载配置

```bash
sudo systemctl reload nginx
```

### 26.3 重启 Nginx

```bash
sudo systemctl restart nginx
```

### 26.4 查看 Nginx 状态

```bash
sudo systemctl status nginx
```

### 26.5 查看日志

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 26.6 常见配置目录

Ubuntu 上常见：

```text
/etc/nginx/nginx.conf
/etc/nginx/sites-available/
/etc/nginx/sites-enabled/
```

常见启用站点方式：

```bash
sudo ln -s /etc/nginx/sites-available/myapp.conf /etc/nginx/sites-enabled/myapp.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 27. Node.js 项目部署常用命令

如果你部署的是 Node.js 项目，经常会用到下面这些命令。

### 27.1 查看版本

```bash
node -v
npm -v
```

### 27.2 安装依赖

```bash
npm install
```

如果项目使用 lock 文件，希望更稳定可复现：

```bash
npm ci
```

### 27.3 构建项目

```bash
npm run build
```

### 27.4 启动项目

```bash
npm start
```

或：

```bash
node dist/app.js
```

具体以项目的 `package.json` 为准。

查看脚本：

```bash
cat package.json
```

重点看：

```json
{
  "scripts": {
    "start": "...",
    "build": "...",
    "dev": "..."
  }
}
```

### 27.5 使用 PM2 管理 Node 服务

安装：

```bash
sudo npm install -g pm2
```

启动：

```bash
pm2 start dist/app.js --name myapp
```

查看：

```bash
pm2 list
pm2 status
pm2 logs myapp
```

重启：

```bash
pm2 restart myapp
```

停止：

```bash
pm2 stop myapp
```

开机自启：

```bash
pm2 startup
pm2 save
```

`pm2 startup` 会输出一条需要你复制执行的 sudo 命令。

### 27.6 使用 systemd 管理 Node 服务

生产服务器也常用 systemd。服务文件一般放在：

```text
/etc/systemd/system/myapp.service
```

服务文件示例：

```ini
[Unit]
Description=My Node App
After=network.target

[Service]
Type=simple
User=fee
WorkingDirectory=/home/fee/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/app.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

加载配置：

```bash
sudo systemctl daemon-reload
```

启动：

```bash
sudo systemctl start myapp
```

开机自启：

```bash
sudo systemctl enable myapp
```

查看日志：

```bash
sudo journalctl -u myapp -f
```

修改 service 文件后，记得：

```bash
sudo systemctl daemon-reload
sudo systemctl restart myapp
```

## 28. 常见部署流程示例

下面是一个通用思路，具体项目会有差异。

### 28.1 首次部署

创建部署用户：

```bash
sudo adduser fee
sudo usermod -aG sudo fee
su - fee
```

安装基础软件：

```bash
sudo apt update
sudo apt install git curl nginx
```

拉代码：

```bash
git clone https://example.com/your/app.git
cd app
```

安装依赖并构建：

```bash
npm install
npm run build
```

启动服务：

```bash
npm start
```

或者使用 PM2/systemd 管理。

检查端口：

```bash
sudo ss -tulpn | grep ":3000"
```

检查本机访问：

```bash
curl http://localhost:3000
```

配置 Nginx 反向代理后：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

开放端口：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 28.2 日常更新部署

进入项目目录：

```bash
cd /home/fee/app
```

查看状态：

```bash
git status --short
git branch
```

拉代码：

```bash
git pull
```

安装依赖：

```bash
npm install
```

构建：

```bash
npm run build
```

重启服务：

```bash
pm2 restart myapp
```

或：

```bash
sudo systemctl restart myapp
```

看日志：

```bash
pm2 logs myapp
```

或：

```bash
sudo journalctl -u myapp -f
```

检查接口：

```bash
curl -I http://localhost:3000
```

## 29. 排查问题常用套路

### 29.1 服务访问不了

先问几个问题：

```text
服务进程还在吗？
端口还在监听吗？
本机 curl 能访问吗？
Nginx 配置正确吗？
防火墙开了吗？
云服务器安全组放行了吗？
日志里有什么错误？
```

常用命令：

```bash
sudo systemctl status nginx
sudo systemctl status myapp
sudo ss -tulpn
curl -I http://localhost:3000
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
sudo journalctl -u myapp -n 100
sudo ufw status
```

### 29.2 端口被占用

查看端口：

```bash
sudo ss -tulpn | grep ":3000"
```

找到 PID 后：

```bash
ps aux | grep 进程ID
```

必要时结束：

```bash
kill 进程ID
```

### 29.3 磁盘满了

查看整体：

```bash
df -h
```

找大目录：

```bash
sudo du -h --max-depth=1 /var
sudo du -h --max-depth=1 /var/log
```

查看大日志：

```bash
sudo ls -lh /var/log
```

注意：不要随便删除数据库文件、系统文件。日志清理也要确认服务是否正在写入。

### 29.4 权限不够

看到：

```text
Permission denied
```

先查看文件权限：

```bash
ls -lah
```

查看当前用户：

```bash
whoami
id
```

如果是项目目录归属不对，常见修复：

```bash
sudo chown -R fee:fee /home/fee/app
```

如果只是脚本不能执行：

```bash
chmod +x deploy.sh
```

不要直接上来：

```bash
chmod -R 777 .
```

这会带来安全风险。

## 30. 高风险命令与安全习惯

### 30.1 高风险命令

以下命令要特别谨慎：

```bash
rm -rf
chmod -R
chown -R
mv
dd
mkfs
fdisk
iptables
ufw enable
systemctl stop
reboot
shutdown
```

它们可能导致数据丢失、权限混乱、网络断开或服务不可用。

### 30.2 执行危险命令前的三步

第一步，确认当前目录：

```bash
pwd
```

第二步，确认目标：

```bash
ls -lah 目标路径
```

第三步，先做非破坏性预览。

例如要删除日志前，先：

```bash
find /var/log -name "*.old" -type f
```

确认没问题后再考虑删除。

### 30.3 养成备份习惯

改配置前：

```bash
sudo cp -a /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
```

改项目配置前：

```bash
cp -a .env .env.bak
```

### 30.4 最小权限原则

建议：

```text
普通项目文件归部署用户所有
系统配置用 sudo 修改
不要长期用 root 跑应用
不要给目录随便 chmod 777
```

## 31. 常用命令速查表

### 31.1 目录与文件

```bash
pwd                         # 查看当前目录
ls -lah                     # 查看文件列表，包含隐藏文件
cd /path/to/dir             # 进入目录
mkdir -p logs/app           # 创建多级目录
touch app.log               # 创建空文件
cp file file.bak            # 复制文件
cp -r dir dir.bak           # 复制目录
mv old new                  # 移动或重命名
rm file                     # 删除文件
rm -r dir                   # 删除目录
```

### 31.2 查看与搜索

```bash
cat file                    # 查看小文件
less file                   # 分页查看大文件
head -n 50 file             # 查看前 50 行
tail -n 100 file            # 查看后 100 行
tail -f file                # 实时跟踪文件
grep -rin "keyword" dir     # 在目录中递归搜索
wc -l file                  # 统计行数
diff old new                # 比较差异
```

### 31.3 权限与用户

```bash
whoami                      # 当前用户名
id                          # 当前用户和组
sudo adduser fee            # 创建用户
sudo usermod -aG sudo fee   # 加入 sudo 组
su - fee                    # 切换用户
chmod +x script.sh          # 增加执行权限
chmod 644 file              # 设置文件权限
chmod 755 script.sh         # 设置脚本权限
sudo chown -R fee:fee app   # 修改目录所有者
```

### 31.4 软件包

```bash
sudo apt update             # 更新软件包索引
sudo apt upgrade            # 升级已安装软件
sudo apt install nginx git  # 安装软件
sudo apt remove nginx       # 删除软件
sudo apt purge nginx        # 删除软件和配置
sudo apt autoremove         # 清理不用的依赖
apt search nginx            # 搜索软件
apt show nginx              # 查看软件信息
```

### 31.5 服务与日志

```bash
sudo systemctl status nginx     # 查看服务状态
sudo systemctl start nginx      # 启动服务
sudo systemctl stop nginx       # 停止服务
sudo systemctl restart nginx    # 重启服务
sudo systemctl reload nginx     # 重新加载配置
sudo systemctl enable nginx     # 设置开机自启
sudo journalctl -u nginx -f     # 实时查看服务日志
systemctl --failed              # 查看失败服务
```

### 31.6 网络与端口

```bash
ip addr                         # 查看 IP
ip route                        # 查看路由
ping example.com                # 测试连通性
curl -I http://localhost        # 查看 HTTP 响应头
sudo ss -tulpn                  # 查看监听端口
sudo ufw status                 # 查看防火墙
sudo ufw allow 80/tcp           # 放行 80 端口
sudo ufw allow 443/tcp          # 放行 443 端口
```

### 31.7 系统资源

```bash
df -h                           # 查看磁盘空间
du -h --max-depth=1 /var        # 查看目录大小
free -h                         # 查看内存
uptime                          # 查看运行时间和负载
top                             # 实时资源监控
lsblk                           # 查看磁盘设备
```

### 31.8 压缩与传输

```bash
tar -czf app.tar.gz app/        # 打包压缩
tar -xzf app.tar.gz             # 解压 tar.gz
zip -r app.zip app/             # zip 压缩
unzip app.zip                   # zip 解压
ssh fee@server                  # SSH 登录
scp file fee@server:/home/fee/  # 复制文件到服务器
rsync -avz app/ fee@server:/home/fee/app/  # 同步目录
```

## 32. 推荐学习顺序

如果你的目标是部署项目、管理服务器，不需要一开始就学完整 Bash 编程。建议按这个顺序：

```text
1. 路径：pwd、ls、cd、绝对路径、相对路径
2. 文件：cat、less、tail、grep、cp、mv、rm、mkdir
3. 权限：sudo、chmod、chown、用户和用户组
4. 软件：apt install、apt update
5. 服务：systemctl、journalctl
6. 网络：curl、ss、ufw、ssh、scp
7. 部署：git、npm、nginx、pm2/systemd
8. 排查：日志、端口、进程、磁盘、权限
9. 脚本：变量、引号、管道、重定向、&&、cron
```

掌握这些之后，你已经可以处理大多数服务器部署和日常维护问题。

## 33. 最后记住几条

1. 命令通常是 `命令 + 选项 + 参数`。
2. `sudo` 表示以管理员权限执行后面的命令。
3. 删除、递归改权限、移动系统文件前一定先确认 `pwd` 和目标路径。
4. 服务器出问题时先看状态、端口、日志：`systemctl status`、`ss -tulpn`、`journalctl`、`tail -f`。
5. 改 Nginx 配置后先 `nginx -t`，再 `systemctl reload nginx`。
6. 权限不够时先查 `whoami`、`id`、`ls -l`，不要直接 `chmod 777`。
7. 部署不是只会启动命令，还要会看日志、确认端口、验证 HTTP、设置开机自启。

