# Ubuntu 系统入门与常用命令指南

> 适用读者：第一次接触 Ubuntu/Linux，需要通过 SSH 管理云服务器并部署 fee-pro 的开发者。  
> 适用环境：Ubuntu Server 26.04 64 位；大多数命令也适用于其他 Ubuntu LTS 版本。  
> 相关文档：[阿里云 ECS 从零部署 fee-pro 测试环境指南](./15_阿里云ECS从零部署fee-pro测试环境指南.md)。  
> 编写日期：2026-07-16。

## 一、Ubuntu 是什么

Ubuntu 是一个基于 Linux 内核的操作系统发行版。可以先这样理解几个概念：

| 名称 | 含义 |
| --- | --- |
| Linux | 操作系统内核，负责进程、内存、磁盘、网络和硬件管理 |
| Ubuntu | 把 Linux 内核、命令行工具、软件仓库和系统管理工具组合成可直接使用的操作系统 |
| Ubuntu Desktop | 带图形桌面，适合个人电脑 |
| Ubuntu Server | 通常不安装桌面，通过 SSH 和命令行管理，适合云服务器 |
| Shell | 接收并解释命令的程序，Ubuntu 常用 Bash |
| Terminal | 输入 Shell 命令并显示结果的窗口 |

阿里云 ECS 上的 Ubuntu 一般是 Server 版本。它没有 Windows 那样的桌面和资源管理器，但并不意味着功能少；服务器管理通常通过命令行完成，资源占用更低，也更适合自动化。

Ubuntu 的几个重要特点：

- 多用户：可以同时存在 `root`、`fee`、`ubuntu` 等用户。
- 权限严格：普通用户默认不能修改系统配置，需要通过 `sudo` 临时获得管理员权限。
- 文件名区分大小写：`app.js`、`App.js` 和 `APP.js` 是三个不同文件。
- 使用 `/` 分隔目录：例如 `/opt/fee-pro/server`，没有 `C:`、`D:` 盘符。
- 配置大量使用文本文件：Nginx、Redis、SSH 等通常通过编辑 `/etc` 下的文本配置完成。
- 软件主要通过仓库安装：使用 `apt` 安装和升级软件。
- 后台服务通常由 systemd 管理：使用 `systemctl` 启动、停止、重启和设置开机自启。

## 二、第一次连接服务器

### 2.1 通过 SSH 登录

在 Windows PowerShell、Windows Terminal、Git Bash 或 WSL 中执行：

```bash
ssh root@8.138.93.199
```

使用私钥时：

```bash
ssh -i ~/.ssh/your-ecs-key.pem root@8.138.93.199
```

第一次连接可能看到服务器指纹确认：

```text
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

确认 IP 是自己的服务器后输入：

```text
yes
```

登录后，命令提示符可能类似：

```text
fee@launch-advisor:~$
```

它的含义是：

```text
fee              当前用户
launch-advisor   主机名
~                当前目录，~ 代表当前用户的家目录
$                普通用户提示符
```

如果末尾是 `#`，通常表示当前是 `root` 用户：

```text
root@launch-advisor:~#
```

文档代码块里只需要输入命令本身，不要把 `$`、`#` 或命令输出一起复制进去。

### 2.2 退出 SSH

```bash
exit
```

也可以按 `Ctrl+D`。SSH 断开不会自动停止由 systemd 或 PM2 管理的服务，但会停止直接在当前终端前台运行的普通程序。

### 2.3 常用终端快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Tab` | 自动补全命令、目录和文件名；连续按两次可显示候选项 |
| `↑` / `↓` | 浏览历史命令 |
| `Ctrl+C` | 中止当前前台命令 |
| `Ctrl+L` | 清屏，等价于 `clear` |
| `Ctrl+A` | 光标移动到行首 |
| `Ctrl+E` | 光标移动到行尾 |
| `Ctrl+U` | 删除光标前的整段内容 |
| `Ctrl+K` | 删除光标后的整段内容 |
| `Ctrl+R` | 在历史命令中反向搜索 |
| `Ctrl+Z` | 暂停当前前台进程，不等于结束进程 |
| `Ctrl+D` | 发送输入结束信号；在空提示符下通常会退出 Shell |
| `Ctrl+Q` | 如果误按 `Ctrl+S` 导致终端像“卡住”，用它恢复输出 |

不同 SSH 客户端的复制粘贴快捷键可能不同。Windows Terminal 通常使用 `Ctrl+Shift+C` 和 `Ctrl+Shift+V`，也可以右键粘贴。

## 三、命令的基本结构

Linux 命令通常由三部分组成：

```text
命令 [选项] [参数]
```

例如：

```bash
ls -lah /opt/fee-pro
```

其中：

- `ls` 是命令，用于列出目录内容。
- `-lah` 是选项组合。
- `/opt/fee-pro` 是操作对象。

短选项通常以一个短横线开头：

```bash
ls -l
```

长选项通常以两个短横线开头：

```bash
ls --all
```

查看命令帮助：

```bash
ls --help
man ls
```

在 `man` 页面中：

- 按 `Space` 向下翻页。
- 按 `b` 向上翻页。
- 输入 `/关键字` 后回车可搜索。
- 按 `n` 跳到下一个匹配。
- 按 `q` 退出。

判断一个命令来自哪里：

```bash
type ls
command -v nginx
command -v node
```

查看系统和版本：

```bash
cat /etc/os-release
uname -a
hostnamectl
```

## 四、理解 Ubuntu 的目录结构

Linux 只有一棵从 `/` 开始的目录树。

```text
/
├── home/       普通用户家目录
├── root/       root 用户家目录
├── etc/        系统和服务配置
├── var/        日志、缓存、数据库等经常变化的数据
├── opt/        手工部署的第三方应用
├── usr/        系统程序、库和共享资源
├── bin/        常用基础命令，现代 Ubuntu 通常链接到 /usr/bin
├── sbin/       系统管理命令
├── tmp/        临时文件，可能在重启后被清理
├── run/        服务运行时状态、PID 文件和 socket
├── dev/        设备文件
├── proc/       内核和进程信息的虚拟文件系统
└── mnt/        临时挂载磁盘的位置
```

fee-pro 部署时最常接触：

| 路径 | 用途 |
| --- | --- |
| `/opt/fee-pro` | 项目代码 |
| `/opt/fee-pro/server` | Node.js 后端 |
| `/opt/fee-pro/client/dist` | 前端构建产物 |
| `/etc/nginx/` | Nginx 配置 |
| `/etc/redis/redis.conf` | Redis 配置 |
| `/var/log/nginx/` | Nginx 日志 |
| `/home/fee` | `fee` 用户家目录 |
| `/home/fee/.nvm` | 使用 nvm 安装的 Node.js |

### 4.1 绝对路径与相对路径

绝对路径从 `/` 开始：

```text
/opt/fee-pro/server
```

相对路径以当前目录为参照：

```text
server/src/app.js
```

几个特殊路径：

| 写法 | 含义 |
| --- | --- |
| `/` | 根目录 |
| `~` | 当前用户家目录 |
| `.` | 当前目录 |
| `..` | 上一级目录 |
| `-` | 上一次所在目录，仅部分命令支持，例如 `cd -` |

示例：

```bash
cd /opt/fee-pro
cd server
cd ..
cd ~
cd -
```

始终可以用下面的命令确认自己在哪里：

```bash
pwd
```

## 五、目录和文件的常用命令

### 5.1 查看目录内容

```bash
ls
ls -l
ls -la
ls -lah
ls -lah /opt/fee-pro
```

常见选项：

| 选项 | 作用 |
| --- | --- |
| `-l` | 显示权限、所有者、大小和时间等详细信息 |
| `-a` | 显示以 `.` 开头的隐藏文件 |
| `-h` | 以 KiB、MiB、GiB 等可读单位显示大小 |
| `-t` | 按修改时间排序 |

安装并使用树形目录工具：

```bash
sudo apt install -y tree
tree -L 2 /opt/fee-pro
```

### 5.2 创建目录和文件

创建目录：

```bash
mkdir test-dir
mkdir -p /tmp/ubuntu-practice/config
```

`-p` 会自动创建缺少的父目录，目录已经存在时也不会报错。

创建空文件或更新时间：

```bash
touch test.txt
```

### 5.3 复制文件和目录

复制文件：

```bash
cp source.txt target.txt
```

复制目录并保留属性：

```bash
cp -a source-dir target-dir
```

修改配置前建议先备份：

```bash
sudo cp -a /etc/nginx/conf.d/fee-pro.conf /etc/nginx/conf.d/fee-pro.conf.bak
```

生成带时间的备份名：

```bash
sudo cp -a /etc/nginx/conf.d/fee-pro.conf "/etc/nginx/conf.d/fee-pro.conf.bak.$(date +%Y%m%d%H%M%S)"
```

### 5.4 移动和重命名

Linux 使用同一个 `mv` 命令完成移动和重命名：

```bash
mv old-name.txt new-name.txt
mv new-name.txt /tmp/
```

防止误覆盖可加 `-i`：

```bash
mv -i source.txt target.txt
```

### 5.5 删除文件和目录

删除文件并在操作前确认：

```bash
rm -i test.txt
```

删除空目录：

```bash
rmdir empty-dir
```

递归删除目录：

```bash
rm -r test-dir
```

`rm -rf` 会递归强制删除且不确认，是服务器上最危险的常用命令之一。执行前至少确认：

```bash
pwd
ls -lah target-dir
readlink -f target-dir
```

确认目标无误后再删除。不要执行来源不明的删除命令，也不要对变量为空的路径执行 `rm -rf`。

### 5.6 查看文件信息

```bash
file /opt/fee-pro/server/package.json
stat /opt/fee-pro/server/package.json
du -sh /opt/fee-pro
```

`file` 判断文件类型，`stat` 显示详细属性，`du` 统计占用空间。

### 5.7 查找文件

按名称查找：

```bash
find /opt/fee-pro -type f -name 'package.json'
find /opt/fee-pro/server -type f -name '*.js'
```

查找最近一天修改的文件：

```bash
find /opt/fee-pro -type f -mtime -1
```

查找大于 100 MiB 的文件：

```bash
sudo find /var -type f -size +100M
```

## 六、查看和搜索文件内容

### 6.1 查看小文件

```bash
cat /etc/os-release
```

给每一行加行号：

```bash
nl -ba /etc/nginx/conf.d/fee-pro.conf
```

不要用 `cat` 直接打开几百 MiB 的日志，它会快速刷满终端。

### 6.2 分页查看大文件

```bash
less /var/log/nginx/fee-error.log
```

`less` 常用按键：

| 按键 | 作用 |
| --- | --- |
| `Space` | 下一页 |
| `b` | 上一页 |
| `g` | 文件开头 |
| `G` | 文件末尾 |
| `/error` | 向下搜索 `error` |
| `n` | 下一个匹配 |
| `N` | 上一个匹配 |
| `q` | 退出 |

### 6.3 查看开头、结尾和实时日志

```bash
head -n 20 /var/log/nginx/fee-error.log
tail -n 50 /var/log/nginx/fee-error.log
tail -f /var/log/nginx/fee-access.log
```

`tail -f` 会持续等待新日志，按 `Ctrl+C` 退出。

### 6.4 搜索文本

Ubuntu 通常自带 `grep`：

```bash
grep -n 'error' app.log
grep -ni 'error' app.log
grep -RIn 'nginxLogFilePath' /opt/fee-pro/server/src
```

常见选项：

| 选项 | 作用 |
| --- | --- |
| `-n` | 显示行号 |
| `-i` | 忽略大小写 |
| `-R` | 递归搜索目录 |
| `-v` | 显示不匹配的行 |
| `-C 3` | 同时显示匹配行前后各 3 行 |

代码仓库中更推荐速度更快的 ripgrep：

```bash
sudo apt install -y ripgrep
rg -n 'nginxLogFilePath' /opt/fee-pro/server/src
rg --files /opt/fee-pro
```

### 6.5 统计行数和字符数

```bash
wc -l app.log
wc -w README.md
wc -c package.json
```

## 七、如何编辑文件

服务器上最常用的编辑器是 Nano 和 Vim。刚接触 Ubuntu 时建议先用 Nano；熟悉后再学 Vim。

无论使用哪个编辑器，修改系统配置前都建议：

1. 先确认文件路径。
2. 先备份原文件。
3. 修改后运行对应程序的语法检查。
4. 语法检查成功后再 reload 或 restart 服务。

### 7.1 使用 Nano 编辑文件

安装 Nano：

```bash
sudo apt install -y nano
```

编辑普通文件：

```bash
nano /opt/fee-pro/server/src/configs/common.js
```

编辑系统配置：

```bash
sudo nano /etc/nginx/conf.d/fee-pro.conf
```

Nano 底部显示的 `^` 表示 `Ctrl`。常用快捷键：

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl+O` | 保存，随后按回车确认文件名 |
| `Ctrl+X` | 退出；有未保存内容时会询问是否保存 |
| `Ctrl+W` | 搜索文本 |
| `Alt+W` | 跳到下一个匹配 |
| `Ctrl+K` | 剪切当前行 |
| `Ctrl+U` | 粘贴刚剪切的内容 |
| `Alt+U` | 撤销 |
| `Alt+E` | 重做 |
| `Ctrl+_` | 跳转到指定行号 |

最常见的保存退出流程：

```text
编辑内容
按 Ctrl+O
按 Enter
按 Ctrl+X
```

### 7.2 使用 Vim 编辑文件

安装 Vim：

```bash
sudo apt install -y vim
```

打开文件：

```bash
vim /opt/fee-pro/server/src/configs/common.js
sudo vim /etc/nginx/conf.d/fee-pro.conf
```

Vim 最重要的是理解“模式”：

| 模式 | 用途 | 如何进入 |
| --- | --- | --- |
| 普通模式 | 移动、删除、复制、撤销和执行命令 | 打开 Vim 后默认进入；其他模式按 `Esc` 返回 |
| 插入模式 | 输入文字 | 普通模式按 `i`、`a` 或 `o` |
| 命令行模式 | 保存、退出、替换等 | 普通模式按 `:` |

第一次用 Vim，只记住下面几步就够了：

1. 按 `i` 进入插入模式。
2. 正常输入和修改内容。
3. 按 `Esc` 返回普通模式。
4. 输入 `:wq` 后回车，保存并退出。

常用命令：

| 操作 | 命令 |
| --- | --- |
| 保存 | `:w` |
| 退出 | `:q` |
| 保存并退出 | `:wq` |
| 不保存强制退出 | `:q!` |
| 显示行号 | `:set number` |
| 撤销 | `u` |
| 重做 | `Ctrl+R` |
| 删除当前行 | `dd` |
| 复制当前行 | `yy` |
| 粘贴 | `p` |
| 跳到文件开头 | `gg` |
| 跳到文件末尾 | `G` |
| 跳到第 100 行 | `100G` |
| 搜索 | `/关键字` 后回车 |
| 下一个搜索结果 | `n` |
| 上一个搜索结果 | `N` |
| 全文确认式替换 | `:%s/旧内容/新内容/gc` |

如果进入 Vim 后不知道自己在哪个模式，先连续按两次 `Esc`。不想保留改动时输入：

```text
:q!
```

然后回车。

### 7.3 使用重定向和 tee 写文件

把命令输出覆盖写入文件：

```bash
echo 'hello' > /tmp/hello.txt
```

追加写入：

```bash
echo 'second line' >> /tmp/hello.txt
```

注意：`>` 会清空原文件再写入，操作配置文件前要格外小心。

以下命令经常失败：

```bash
sudo echo 'text' > /etc/example.conf
```

原因是 `sudo` 只提升了 `echo`，重定向仍由当前普通用户执行。应该使用：

```bash
echo 'text' | sudo tee /etc/example.conf
```

追加时：

```bash
echo 'text' | sudo tee -a /etc/example.conf
```

写入多行配置：

```bash
sudo tee /etc/example.conf > /dev/null <<'EOF'
first line
second line
EOF
```

`EOF` 使用单引号后，中间的 `$变量` 和命令替换不会被当前 Shell 展开，适合写配置模板。

### 7.4 比较修改前后的文件

```bash
diff -u /etc/nginx/conf.d/fee-pro.conf.bak /etc/nginx/conf.d/fee-pro.conf
```

Git 仓库中的改动：

```bash
cd /opt/fee-pro
git status --short
git diff
```

### 7.5 处理 Windows 换行符

Windows 常用 CRLF，Linux 常用 LF。Shell 脚本如果报下面的错误：

```text
/bin/bash^M: bad interpreter
```

可以安装并执行：

```bash
sudo apt install -y dos2unix
dos2unix script.sh
```

## 八、用户、用户组、root 和 sudo

### 8.1 查看当前身份

```bash
whoami
id
groups
```

含义：

| 命令 | 作用 |
| --- | --- |
| `whoami` | 查看当前用户名 |
| `id` | 查看当前用户的 UID、主用户组、附加用户组 |
| `groups` | 查看当前用户属于哪些用户组 |

查看当前有哪些用户正在登录：

```bash
who
w
```

### 8.2 sudo 是什么

`sudo` 是 `superuser do` 的缩写，可以理解为“以管理员权限执行后面的命令”。

普通用户默认不能随意修改系统文件、安装软件、管理系统服务。`sudo` 的作用就是让被授权的普通用户临时获得更高权限，只执行这一条命令。

基本结构：

```bash
sudo 命令 [选项] [参数]
```

例子：

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl restart nginx
sudo nano /etc/nginx/conf.d/fee-pro.conf
```

这些命令分别表示：

| 命令 | 作用 |
| --- | --- |
| `sudo apt update` | 以管理员权限更新软件包索引 |
| `sudo apt install -y nginx` | 以管理员权限安装 Nginx |
| `sudo systemctl restart nginx` | 以管理员权限重启 Nginx 服务 |
| `sudo nano /etc/nginx/conf.d/fee-pro.conf` | 以管理员权限编辑 Nginx 配置 |

`sudo` 通常会要求输入当前用户自己的密码。输入密码时屏幕不会显示 `*`，这是正常现象，输入完成后按回车即可。

如果当前用户没有 sudo 权限，可能看到：

```text
user is not in the sudoers file
```

或：

```text
Permission denied
```

这表示当前用户没有被授权执行管理员命令，需要 root 或已有 sudo 权限的用户把它加入 `sudo` 组。

### 8.3 sudo 常见用法

执行管理员命令：

```bash
sudo systemctl status nginx
```

以另一个用户身份执行命令：

```bash
sudo -u fee whoami
```

进入 root 登录环境：

```bash
sudo -i
```

查看当前用户能执行哪些 sudo 命令：

```bash
sudo -l
```

清除当前终端缓存的 sudo 认证：

```bash
sudo -k
```

之后再次执行 `sudo` 时，会重新要求输入密码。

编辑系统文件也可以使用：

```bash
sudoedit /etc/nginx/conf.d/fee-pro.conf
```

`sudoedit` 会用更安全的方式编辑需要管理员权限的文件。如果你还不熟悉它，先用 `sudo nano 文件路径` 也可以。

需要注意：`sudo` 只提升后面那条命令的权限，不一定提升整行命令中的所有操作。例如：

```bash
sudo echo 'text' > /etc/example.conf
```

这条命令经常失败，因为 `echo` 是 sudo 执行的，但 `>` 重定向是当前普通 Shell 执行的。更可靠的写法是：

```bash
echo 'text' | sudo tee /etc/example.conf
```

### 8.4 什么场景需要使用 sudo

一般需要 `sudo` 的场景：

| 场景 | 示例 |
| --- | --- |
| 安装、升级、删除系统软件 | `sudo apt install nginx` |
| 修改 `/etc` 下的系统配置 | `sudo nano /etc/nginx/nginx.conf` |
| 启动、停止、重启系统服务 | `sudo systemctl restart nginx` |
| 修改系统目录文件 | `sudo cp app.conf /etc/nginx/conf.d/` |
| 修改文件所有者 | `sudo chown -R fee:fee /opt/fee-pro` |
| 查看部分系统日志 | `sudo journalctl -u nginx -n 100` |
| 查看部分进程和端口详情 | `sudo ss -lntp` |
| 管理防火墙 | `sudo ufw allow 80/tcp` |

通常不需要 `sudo` 的场景：

| 场景 | 示例 |
| --- | --- |
| 查看自己目录下的文件 | `ls -lah` |
| 编辑自己拥有的项目文件 | `nano app.js` |
| 在自己拥有的项目目录里拉代码 | `git pull` |
| 在自己拥有的项目目录里安装依赖 | `npm install` |
| 查看普通命令帮助 | `ls --help` |

不要习惯性给所有命令加 `sudo`。例如不要在项目目录里随手执行：

```bash
sudo npm install
```

这样可能导致 `node_modules` 或其他生成文件变成 root 所有，后续普通用户无法删除或修改，部署时会出现权限问题。

### 8.5 Ubuntu 有几个用户组和权限组

Ubuntu 里没有固定“只有几个用户组”的说法。用户组是可以创建、删除和扩展的，系统安装的软件不同，用户组数量也会不同。

可以查看系统已有用户组：

```bash
getent group
```

只看用户组名称：

```bash
cut -d: -f1 /etc/group
```

查看某个用户属于哪些组：

```bash
id fee
groups fee
```

Linux 权限里要区分两个概念：

| 概念 | 说明 |
| --- | --- |
| 用户组 group | 系统里的用户集合，例如 `sudo`、`adm`、`www-data` |
| 权限类别 | 每个文件都有三类权限：所有者、所属组、其他用户 |

执行：

```bash
ls -l app.js
```

可能看到：

```text
-rw-r--r-- 1 fee fee 1024 Jul 16 12:00 app.js
```

这里第一个 `fee` 是文件所有者，第二个 `fee` 是文件所属组。前面的权限 `rw-r--r--` 分成三段：

```text
rw-  所有者权限
r--  所属组权限
r--  其他用户权限
```

所以，“用户组”不是固定几个；但文件权限判断通常固定分为三类：

```text
所有者 owner
所属组 group
其他用户 others
```

每一类又可以有三种权限：

```text
r  read，读
w  write，写
x  execute，执行
```

### 8.6 Ubuntu 常见用户组

不同机器上的用户组会有差异，但服务器上常见的有：

| 用户组 | 常见作用 |
| --- | --- |
| `sudo` | 允许成员使用 `sudo` 执行管理员命令 |
| `adm` | 允许成员读取部分系统日志，例如 `/var/log` 下的日志 |
| `www-data` | Nginx、Apache 等 Web 服务常用用户/用户组 |
| `systemd-journal` | 允许读取 systemd journal 日志 |
| `docker` | 允许不加 sudo 执行 Docker 命令，权限很高 |
| `users` | 普通用户组，部分系统会使用 |
| `root` | root 用户相关组 |

特别注意 `docker` 组。加入 `docker` 组后，用户通常可以通过 Docker 获得接近 root 的能力，不要随便把不可信用户加入这个组。

一个用户通常有一个主用户组，也可以有多个附加用户组。

创建用户 `fee` 时，Ubuntu 通常会创建一个同名主用户组：

```text
用户：fee
主组：fee
```

把 `fee` 加入 sudo 附加组：

```bash
sudo usermod -aG sudo fee
```

这里的参数含义：

| 参数 | 含义 |
| --- | --- |
| `-a` | append，追加到附加组 |
| `-G sudo` | 指定附加组为 `sudo` |
| `fee` | 要修改的用户名 |

`-a` 很重要，不要漏掉。只写 `usermod -G sudo fee` 可能覆盖用户原有的附加组。

新增用户组权限通常需要退出 SSH 后重新登录才会完整生效。可以用下面命令确认：

```bash
id fee
groups fee
```

### 8.7 root 用户与普通用户是否都需要 sudo

`root` 是最高权限用户，可以修改或删除几乎任何文件，也可以管理系统服务、用户、网络和软件包。

普通用户权限较低，默认不能修改系统关键目录，例如：

```text
/etc
/usr
/var/log
/root
/lib
/bin
```

普通用户需要执行管理员操作时，才使用 `sudo`：

```bash
sudo apt update
sudo systemctl restart nginx
sudo chown -R fee:fee /opt/fee-pro
```

root 用户通常不需要 `sudo`，因为 root 已经拥有最高权限。你在 root 终端里执行：

```bash
apt update
systemctl restart nginx
```

本身就是管理员权限。

不过 root 有时也会使用 `sudo -u`，不是为了提升权限，而是为了“降级”为某个普通用户去执行命令：

```bash
sudo -u fee whoami
sudo -u www-data php -v
```

这类用法常见于排查某个服务用户能否访问文件、能否执行程序。

日常建议：

| 用户类型 | 建议 |
| --- | --- |
| 普通用户 | 日常登录和维护项目，需要管理员权限时给单条命令加 `sudo` |
| root 用户 | 少用作日常用户，适合初始化服务器、修复权限、紧急维护 |
| 服务用户 | 只运行服务，不用于日常登录，例如 `www-data`、`mysql` |

长期直接用 root 操作项目容易造成两个问题：

1. 误删、误改系统文件的风险更大。
2. 项目文件可能变成 root 所有，普通部署用户无法继续维护。

### 8.8 创建和管理用户

创建用户：

```bash
sudo adduser fee
```

允许用户使用 sudo：

```bash
sudo usermod -aG sudo fee
```

修改当前用户自己的密码：

```bash
passwd
```

由管理员修改 `fee` 用户的密码：

```bash
sudo passwd fee
```

切换到另一个用户并加载其完整环境：

```bash
su - fee
```

进入 root Shell：

```bash
sudo -i
```

用完立刻退出：

```bash
exit
```

## 九、文件所有者与权限

执行：

```bash
ls -l /opt/fee-pro
```

可能看到：

```text
drwxr-xr-x 5 fee fee 4096 Jul 16 10:00 server
-rw-r--r-- 1 fee fee 1200 Jul 16 10:00 README.md
```

第一段可以拆成：

```text
d rwx r-x r-x
│ │   │   └── 其他用户权限
│ │   └────── 所属组权限
│ └────────── 所有者权限
└──────────── 文件类型：d 是目录，- 是普通文件，l 是软链接
```

权限字母：

| 字母 | 文件上的含义 | 目录上的含义 |
| --- | --- | --- |
| `r` | 读取内容 | 列出目录内容 |
| `w` | 修改内容 | 创建、删除、重命名目录内项目 |
| `x` | 执行文件 | 进入目录并访问其中项目 |

### 9.1 修改权限 chmod

给脚本增加执行权限：

```bash
chmod +x deploy.sh
```

数字权限由 `r=4`、`w=2`、`x=1` 相加：

| 权限 | 常见用途 |
| --- | --- |
| `644` | 普通配置和文本文件：所有者可读写，其他人只读 |
| `755` | 目录或公开脚本：所有者可读写执行，其他人可读执行 |
| `600` | 私钥、密码文件：仅所有者可读写 |
| `700` | 私有目录或脚本：仅所有者可访问 |

示例：

```bash
chmod 644 config.js
chmod 755 deploy.sh
chmod 600 ~/.ssh/id_ed25519
chmod 700 ~/.ssh
```

不要为省事使用 `chmod -R 777`。它会让所有用户都可修改文件，既不安全，也常常掩盖真正的所有者配置问题。

### 9.2 修改所有者 chown

```bash
sudo chown fee:fee /opt/fee-pro
sudo chown -R fee:fee /opt/fee-pro
```

`-R` 表示递归修改。执行前确认绝对路径，避免把系统目录所有权改坏。

让 `fee` 用户读取 Ubuntu 的系统日志，可把它加入 `adm` 组：

```bash
sudo usermod -aG adm fee
```

新增组权限通常需要退出 SSH 后重新登录才会完整生效。可以用下面命令确认：

```bash
id fee
```

## 十、软件安装与 apt

Ubuntu 最常用的软件包管理工具是 APT。平时说“用 apt 安装软件”，通常就是指从 Ubuntu 配置好的软件源里下载 `.deb` 软件包，并自动处理依赖、安装、升级和删除。

### 10.1 apt 是什么

APT 是 `Advanced Package Tool` 的缩写，是 Debian、Ubuntu 系统上的软件包管理体系。

你可以把它理解成系统级软件管家。它主要负责：

| 作用 | 说明 |
| --- | --- |
| 查找软件 | 从已配置的软件源里搜索软件包 |
| 安装软件 | 下载软件包，并安装到系统标准目录 |
| 自动处理依赖 | 安装 Nginx 时，如果它依赖其他库，APT 会一起安装 |
| 升级软件 | 根据软件源里的新版本升级已安装软件 |
| 删除软件 | 删除程序文件，必要时也可以删除配置文件 |
| 记录软件状态 | 知道哪些包是手动安装，哪些包是依赖安装 |

APT 管理的是系统级软件，例如：

```text
nginx
mysql-server
redis-server
git
curl
vim
nodejs
python3
```

它不只是一个命令，而是一套工具。常见相关命令有：

| 命令 | 作用 |
| --- | --- |
| `apt` | 面向日常交互使用的高级命令，初学者优先用它 |
| `apt-get` | 更老、更稳定的命令，脚本和自动化部署里仍常见 |
| `apt-cache` | 查询软件包缓存信息，很多功能现在可用 `apt search/show` 替代 |
| `dpkg` | 更底层的 `.deb` 包管理工具，只管本地包，不会像 apt 那样自动从软件源解决依赖 |

简单理解：

```text
apt      更像常用入口
apt-get  更适合脚本
dpkg     更底层，处理具体 .deb 包
```

### 10.2 apt 命令格式与常用参数

基本格式：

```bash
apt [选项] 子命令 [软件包名]
```

日常更常见的格式：

```bash
sudo apt 子命令 软件包名
```

例如：

```bash
sudo apt install nginx
```

拆开看：

```text
sudo     以管理员权限执行
apt      软件包管理命令
install  子命令，表示安装
nginx    软件包名
```

常用子命令：

| 子命令 | 示例 | 作用 |
| --- | --- | --- |
| `update` | `sudo apt update` | 更新本地软件包索引 |
| `upgrade` | `sudo apt upgrade` | 升级已安装软件 |
| `install` | `sudo apt install nginx` | 安装软件 |
| `remove` | `sudo apt remove nginx` | 删除程序，保留配置 |
| `purge` | `sudo apt purge nginx` | 删除程序和系统配置 |
| `autoremove` | `sudo apt autoremove` | 清理不再需要的依赖 |
| `search` | `apt search nginx` | 搜索软件包 |
| `show` | `apt show nginx` | 查看软件包详情 |
| `list --installed` | `apt list --installed` | 查看已安装软件包 |
| `policy` | `apt policy nginx` | 查看安装版本、候选版本和来源 |

常用选项：

| 选项 | 示例 | 说明 |
| --- | --- | --- |
| `-y` | `sudo apt install -y nginx` | 自动回答 yes，适合脚本，手工操作时要谨慎 |
| `--reinstall` | `sudo apt install --reinstall nginx` | 重新安装某个软件包 |
| `--no-install-recommends` | `sudo apt install --no-install-recommends package` | 不安装推荐依赖，适合精简环境 |
| `--only-upgrade` | `sudo apt install --only-upgrade nginx` | 只升级已安装的软件，不新装 |

新手建议：手动操作时可以先不加 `-y`，认真看 APT 提示“将安装、升级、删除哪些包”，确认后再输入 `Y`。

### 10.3 更新软件索引

```bash
sudo apt update
```

`apt update` 只更新“可安装软件版本清单”，不升级已经安装的软件。

可以把它理解成：刷新本地软件目录，让系统知道软件源里现在有哪些包、有哪些版本。

常见场景：

```text
刚买的新服务器
刚添加新的软件源
准备安装软件之前
准备升级软件之前
```

### 10.4 升级软件

```bash
sudo apt upgrade
```

自动确认：

```bash
sudo apt upgrade -y
```

生产服务器升级前应先看变更和备份；内核、数据库、Nginx 等升级可能需要重启或兼容性验证。

还有一个更激进的升级命令：

```bash
sudo apt full-upgrade
```

它可能为了完成升级而删除某些旧包。服务器上不要随手执行，先看清楚提示。

### 10.5 安装软件

```bash
sudo apt install -y nginx
sudo apt install -y vim nano htop ripgrep tree
```

一次可以安装多个软件包：

```bash
sudo apt install git curl unzip
```

安装前可以先查：

```bash
apt search nginx
apt show nginx
```

如果安装失败，常见原因包括：

```text
没有先执行 apt update
软件包名写错
软件源没有这个包
网络无法访问软件源
系统版本太旧或太新，软件源没有对应版本
```

### 10.6 查询软件

```bash
apt search nginx
apt show nginx
apt list --installed
dpkg -l nginx
```

查看某个文件属于哪个已安装软件包：

```bash
dpkg -S /usr/sbin/nginx
```

查看某个软件包安装了哪些文件：

```bash
dpkg -L nginx
```

查看某个命令实际路径：

```bash
which nginx
whereis nginx
```

查看软件包版本和来源：

```bash
apt policy nginx
```

### 10.7 删除软件

删除程序但保留配置：

```bash
sudo apt remove nginx
```

连同系统配置一起删除：

```bash
sudo apt purge nginx
```

清理不再需要的依赖：

```bash
sudo apt autoremove
```

执行 `purge`、`autoremove` 前先阅读 APT 将要删除的软件清单。

### 10.8 apt 在什么场景中使用

适合使用 APT 的场景：

| 场景 | 示例 |
| --- | --- |
| 安装系统工具 | `sudo apt install curl git vim` |
| 安装服务器软件 | `sudo apt install nginx redis-server mysql-server` |
| 安装排查工具 | `sudo apt install htop ripgrep dnsutils` |
| 安装编译依赖 | `sudo apt install build-essential` |
| 升级系统软件 | `sudo apt update && sudo apt upgrade` |
| 删除不需要的软件 | `sudo apt remove package` |

不太适合直接用 APT 解决的场景：

| 场景 | 更常见方式 |
| --- | --- |
| 安装 Node.js 项目的依赖 | 用 `npm install`、`pnpm install` 或 `yarn install` |
| 安装 Python 项目的依赖 | 用 `pip`、`venv`、`poetry` 等 |
| 部署自己写的业务项目 | 通常放在 `/opt`、`/srv` 或 `/home/用户/app` |
| 需要某软件的官方最新版 | 可能使用官方仓库、PPA、二进制包、Docker 或源码安装 |

### 10.9 Ubuntu 只有 APT 能管理软件包吗

不是。APT 是 Ubuntu 最核心、最常用的系统软件包管理方式，但不是唯一方式。

常见软件安装方式：

| 方式 | 说明 |
| --- | --- |
| APT / `.deb` | Ubuntu 最常用的系统软件包方式 |
| Snap | Ubuntu 默认支持的另一套包管理方式，命令是 `snap` |
| Flatpak | 桌面 Linux 常见，服务器上较少用 |
| 手动下载二进制文件 | 例如下载一个 `tar.gz` 解压到 `/opt` |
| 源码编译安装 | 常见于需要特殊版本或特殊编译参数的软件 |
| Docker 镜像 | 把软件和运行环境放进容器 |
| 语言生态包管理器 | 例如 Node.js 的 `npm`，Python 的 `pip` |

服务器上优先级通常是：

```text
能用官方 APT 源稳定安装，就优先用 APT。
APT 版本太旧，再考虑官方仓库、PPA、Docker 或手动安装。
业务项目依赖用对应语言自己的包管理器。
```

### 10.10 apt 是否相当于 Node.js 中的 npm

可以类比，但不能完全等同。

相同点：

| 相同点 | 说明 |
| --- | --- |
| 都能安装软件包 | `apt install nginx`，`npm install express` |
| 都会处理依赖 | 安装一个包时，会安装它依赖的其他包 |
| 都有远程仓库概念 | APT 有软件源，npm 有 npm registry |
| 都能查询版本和包信息 | `apt show`，`npm view` |

不同点更重要：

| 对比 | APT | npm |
| --- | --- | --- |
| 管理范围 | 操作系统级软件 | Node.js 项目或 Node.js 全局工具 |
| 安装位置 | 系统标准目录，如 `/usr/bin`、`/etc`、`/usr/lib` | 项目 `node_modules` 或 npm 全局目录 |
| 权限要求 | 安装系统包通常需要 root/sudo | 项目依赖通常不需要 sudo |
| 包格式 | `.deb` | npm package |
| 管理方 | Ubuntu/Debian 官方仓库、镜像源、第三方软件源 | npm registry |
| 典型软件 | Nginx、Git、Redis、系统库 | Express、Vue、Webpack、TypeScript |

所以可以这样理解：

```text
apt 是系统层的软件包管理器。
npm 是 Node.js 生态的软件包管理器。
```

安装 Nginx、Git、Redis 用 APT 比较自然：

```bash
sudo apt install nginx git redis-server
```

安装项目依赖用 npm：

```bash
npm install
```

不要在 Node.js 项目目录里习惯性使用：

```bash
sudo npm install
```

否则可能产生 root 所有的 `node_modules`，后续普通部署用户会遇到权限问题。

### 10.11 apt 是不是一个“软件市场”

可以把 APT 软件源粗略理解成“软件仓库”或“软件市场”，但它不是一个任何人都能随便上传的软件平台。

APT 从哪里下载软件，取决于系统配置的软件源。常见配置位置：

```text
/etc/apt/sources.list
/etc/apt/sources.list.d/
```

Ubuntu 官方软件源里的包通常由 Ubuntu/Debian 维护者打包、测试和发布。第三方软件也可以提供自己的 APT 源，例如某些数据库、浏览器、云厂商工具。

大致流程是：

```text
软件作者发布源码或二进制
维护者把它打成 .deb 包
软件源发布这个包及索引信息
用户执行 apt update 获取索引
用户执行 apt install 下载并安装
```

所以它不是“有人上传到 apt 平台，用户才能下载”这么简单，更准确说是：

```text
用户只能从自己服务器配置的软件源中下载软件包。
软件包需要被官方仓库或第三方仓库维护和发布。
```

添加第三方软件源要谨慎，因为你相当于信任它可以向系统安装软件。生产服务器不要随便复制来历不明的：

```bash
curl ... | sudo bash
```

这类命令风险很高，执行前一定要确认来源可信。

### 10.12 apt 安装软件需要 root 或 sudo 吗

查询类命令通常不需要 sudo：

```bash
apt search nginx
apt show nginx
apt list --installed
apt policy nginx
```

安装、升级、删除软件通常需要 root 权限：

```bash
sudo apt install nginx
sudo apt upgrade
sudo apt remove nginx
```

原因是 APT 会修改系统目录，例如：

```text
/usr
/etc
/var
/lib
```

这些目录普通用户默认不能写。

如果你当前就是 root 用户，可以直接执行：

```bash
apt install nginx
```

如果你是普通用户，并且属于 `sudo` 组，使用：

```bash
sudo apt install nginx
```

如果普通用户不在 `sudo` 组，就不能直接安装系统软件，需要管理员授权。

有一个例外：普通用户可以只下载 `.deb` 包到当前目录：

```bash
apt download nginx
```

但真正安装到系统里，仍然需要 root/sudo。

### 10.13 apt 安装的软件在哪里

APT 安装的软件通常不会集中放在一个目录，而是按照 Linux 文件系统规范分散到系统标准位置。

常见位置：

| 路径 | 常见内容 |
| --- | --- |
| `/usr/bin` | 普通用户可执行命令，例如 `git`、`curl` |
| `/usr/sbin` | 系统管理命令，例如 `nginx` |
| `/usr/lib` | 程序库文件 |
| `/lib` | 系统基础库 |
| `/etc` | 配置文件，例如 Nginx 配置 |
| `/var/lib` | 服务运行数据，例如数据库、缓存状态 |
| `/var/log` | 日志文件 |
| `/lib/systemd/system` | systemd 服务定义文件 |
| `/usr/share/doc` | 文档、示例、版权说明 |

以 Nginx 为例，可能涉及：

```text
/usr/sbin/nginx
/etc/nginx/
/var/log/nginx/
/var/www/html/
/lib/systemd/system/nginx.service
```

查看某个命令在哪里：

```bash
which nginx
whereis nginx
```

查看某个软件包安装了哪些文件：

```bash
dpkg -L nginx
```

查看某个文件属于哪个包：

```bash
dpkg -S /usr/sbin/nginx
```

### 10.14 apt 可以指定安装路径吗

通常不可以，也不建议。

APT 安装的是 `.deb` 软件包，包里面已经规定了文件应该放到哪里。APT 的设计目标是把系统软件安装到标准位置，让系统服务、配置文件、日志、依赖关系都能被统一管理。

它不像某些源码安装命令那样经常可以写：

```bash
./configure --prefix=/opt/somewhere
```

也不像 npm 项目依赖那样默认安装到当前项目的：

```text
node_modules/
```

如果你确实需要把某个软件安装到自定义目录，通常会选择：

| 方式 | 适用场景 |
| --- | --- |
| 下载官方二进制包解压到 `/opt` | 软件官方提供独立压缩包 |
| 源码编译并指定 `--prefix` | 需要特殊编译版本 |
| Docker | 希望隔离运行环境 |
| 使用语言版本管理工具 | 例如 `nvm` 管理 Node.js |

一般服务器管理中，不建议改 APT 软件的安装路径，原因是：

1. 系统服务文件通常假设程序在标准路径。
2. 配置文件和日志路径也有默认约定。
3. APT 能自动升级、删除、检查文件归属。
4. 改路径会增加排查难度，别人接手服务器时也不容易判断。

更推荐的做法：

| 类型 | 推荐位置 |
| --- | --- |
| 系统软件 | 用 APT 安装到默认位置 |
| 自己部署的业务项目 | `/opt/项目名`、`/srv/项目名` 或 `/home/部署用户/项目名` |
| 项目日志 | `/var/log/项目名` 或项目自己的 `logs` 目录 |
| 项目配置 | 简单项目可放项目目录；系统级服务配置可放 `/etc/项目名` |

也就是说：Nginx、Git、Redis 这类系统软件交给 APT；你自己的项目代码单独放在 `/opt`、`/srv` 或部署用户家目录下，这样最清晰。

## 十一、进程与后台任务

程序运行后会成为进程，每个进程都有 PID。

### 11.1 查看进程

```bash
ps aux
ps aux | grep nginx
pgrep -a nginx
pgrep -af 'dist/app.js'
```

实时观察资源：

```bash
top
htop
```

`top` 中按 `q` 退出。

### 11.2 结束进程

先发送正常终止信号：

```bash
kill 12345
kill -TERM 12345
```

只有进程无法正常退出时才考虑强制结束：

```bash
kill -KILL 12345
```

`kill -9` 不给程序清理文件、释放锁和完成事务的机会，不应作为默认操作。

### 11.3 前台、后台和作业

在命令末尾加 `&` 可放到当前 Shell 后台：

```bash
sleep 300 &
```

查看当前 Shell 的作业：

```bash
jobs -l
```

恢复到前台：

```bash
fg %1
```

恢复到后台：

```bash
bg %1
```

临时任务可使用 `nohup`，但 fee-pro 这类长期应用更适合 PM2 或 systemd：

```bash
nohup your-command > app.out 2>&1 &
```

## 十二、使用 systemd 管理服务

Ubuntu 使用 systemd 管理 Nginx、MariaDB、Redis、SSH 等系统服务。

以 Nginx 为例：

```bash
sudo systemctl status nginx
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx
sudo systemctl enable nginx
sudo systemctl disable nginx
```

这些操作的区别：

| 操作 | 含义 |
| --- | --- |
| `start` | 启动服务 |
| `stop` | 停止服务 |
| `restart` | 完整停止后重新启动，连接会短暂中断 |
| `reload` | 让服务重新加载配置，通常比 restart 平滑 |
| `enable` | 设置开机自动启动，不等于立即启动 |
| `disable` | 取消开机自动启动，不等于立即停止 |

检查状态而不输出大量内容：

```bash
systemctl is-active nginx
systemctl is-enabled nginx
systemctl --failed
```

fee-pro 常用服务：

```bash
sudo systemctl status nginx
sudo systemctl status mariadb
sudo systemctl status redis-server
sudo systemctl status ssh
```

修改 Nginx 配置后的标准流程：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

只有 `nginx -t` 成功后才 reload。

## 十三、查看系统日志

### 13.1 journalctl

查看某个 systemd 服务最近 100 行日志：

```bash
sudo journalctl -u nginx -n 100 --no-pager
sudo journalctl -u redis-server -n 100 --no-pager
```

实时跟踪：

```bash
sudo journalctl -u nginx -f
```

查看最近 10 分钟：

```bash
sudo journalctl -u nginx --since '10 minutes ago'
```

查看本次开机以来的严重错误：

```bash
sudo journalctl -b -p err
```

### 13.2 传统日志文件

Ubuntu 常见日志位于 `/var/log`：

```bash
sudo ls -lah /var/log
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/fee-access.log
```

认证和 sudo 相关日志常见于：

```bash
sudo less /var/log/auth.log
```

不同 Ubuntu 版本和服务配置可能更偏向 journal，不一定每种日志都有独立文件。

## 十四、网络和端口排查

### 14.1 查看 IP 和路由

```bash
ip addr
hostname -I
ip route
```

`127.0.0.1` 是本机回环地址，只能从服务器自己访问。`0.0.0.0` 表示监听所有 IPv4 网络接口。

fee-pro 测试环境通常这样分工：

| 地址/端口 | 用途 | 是否公开 |
| --- | --- | --- |
| `0.0.0.0:80` | Nginx | 是 |
| `127.0.0.1:3000` | Node API | 否，仅本机 Nginx 访问 |
| `127.0.0.1:3306` | MariaDB/MySQL | 否 |
| `127.0.0.1:6379` | Redis | 否 |

### 14.2 查看监听端口

```bash
sudo ss -lntp
sudo ss -lntp | grep ':80'
sudo ss -lntp | grep ':3000'
```

也可以按端口查进程：

```bash
sudo lsof -iTCP:3000 -sTCP:LISTEN
```

### 14.3 测试 HTTP

获取响应内容：

```bash
curl http://127.0.0.1:3000/api/login/type
```

只看响应头：

```bash
curl -I http://127.0.0.1/
```

显示请求和响应细节：

```bash
curl -v http://127.0.0.1/api/login/type
```

排查 fee-pro 时先测后端本机地址，再测 Nginx：

```bash
curl http://127.0.0.1:3000/api/login/type
curl http://127.0.0.1/api/login/type
curl http://8.138.93.199/api/login/type
```

如果第一条失败，问题在 Node 服务或数据库配置；第一条成功但第二条失败，重点检查 Nginx；前两条成功但公网失败，重点检查 UFW、阿里云安全组和公网 IP。

### 14.4 DNS 和连通性

```bash
ping -c 4 8.8.8.8
getent hosts example.com
```

安装 DNS 工具：

```bash
sudo apt install -y dnsutils
dig example.com
```

有些服务器或网站会禁用 ping，所以 ping 不通不一定代表 HTTP 不通。

### 14.5 UFW 防火墙

```bash
sudo ufw status verbose
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

阿里云安全组和 UFW 是两层独立防火墙。公网访问成功需要两层都允许对应端口。

## 十五、CPU、内存、磁盘和系统负载

### 15.1 CPU 和负载

```bash
uptime
top
htop
nproc
```

`uptime` 最后的三个数字是最近 1、5、15 分钟平均负载。对于 2 核服务器，持续明显高于 `2` 通常意味着任务排队，需要继续观察 CPU、I/O 和具体进程。

### 15.2 内存

```bash
free -h
```

Linux 会尽量利用空闲内存做缓存，所以不要只看 `free` 列；`available` 更接近还能安全分配的内存。

### 15.3 磁盘

查看文件系统容量：

```bash
df -h
df -i
```

`df -i` 检查 inode。即使磁盘容量没满，大量小文件也可能耗尽 inode。

查看目录占用：

```bash
du -sh /opt/fee-pro
sudo du -xh --max-depth=1 /var | sort -h
sudo du -xh --max-depth=1 /var/log | sort -h
```

查看磁盘和挂载：

```bash
lsblk
findmnt
```

fee-pro 数据和日志会持续增长，重点关注：

```text
/var/log/nginx/
/opt/fee-pro/server/log/
MariaDB 数据目录
```

## 十六、压缩、解压和文件传输

### 16.1 tar 压缩包

创建 `.tar.gz`：

```bash
tar -czf fee-pro-backup.tar.gz /opt/fee-pro
```

查看压缩包内容：

```bash
tar -tzf fee-pro-backup.tar.gz
```

解压到指定目录：

```bash
mkdir -p /tmp/fee-restore
tar -xzf fee-pro-backup.tar.gz -C /tmp/fee-restore
```

参数可以记成：

| 参数 | 含义 |
| --- | --- |
| `c` | create，创建 |
| `x` | extract，解压 |
| `t` | list，查看内容 |
| `z` | gzip 压缩 |
| `f` | 后面跟文件名 |

### 16.2 zip

```bash
sudo apt install -y zip unzip
zip -r config-backup.zip config-dir
unzip config-backup.zip -d /tmp/config-restore
```

### 16.3 scp 上传和下载

在本机上传到服务器：

```bash
scp local-file.txt fee@8.138.93.199:/tmp/
```

从服务器下载到本机：

```bash
scp fee@8.138.93.199:/var/log/nginx/fee-error.log ./
```

递归传目录：

```bash
scp -r local-dir fee@8.138.93.199:/opt/
```

### 16.4 rsync 增量同步

```bash
rsync -av --progress local-dir/ fee@8.138.93.199:/opt/target-dir/
```

源目录末尾的 `/` 很重要：

- `local-dir/` 表示同步目录里的内容。
- `local-dir` 表示把目录本身放进目标目录。

使用 `--delete` 会删除目标端多余文件，初学阶段不要使用，除非已经明确确认同步方向和目标目录。

## 十七、Shell 中的管道、重定向和连接符

### 17.1 管道 `|`

管道把前一个命令的输出交给后一个命令：

```bash
ps aux | grep node
sudo ss -lntp | grep ':3000'
history | grep nginx
```

### 17.2 输出重定向

```bash
command > output.log
command >> output.log
command 2> error.log
command > all.log 2>&1
```

含义：

| 写法 | 含义 |
| --- | --- |
| `>` | 覆盖标准输出到文件 |
| `>>` | 追加标准输出到文件 |
| `2>` | 把错误输出写入文件 |
| `2>&1` | 把错误输出合并到标准输出 |

### 17.3 命令连接

仅在前一条成功后执行后一条：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

仅在前一条失败后执行后一条：

```bash
test -f config.js || echo 'config.js 不存在'
```

无论成功失败都继续执行：

```bash
command1; command2
```

部署脚本中通常优先使用 `&&` 或逐条执行，避免前一步失败后仍继续执行危险操作。

### 17.4 通配符和引用

常见通配符：

| 写法 | 含义 |
| --- | --- |
| `*` | 任意长度字符 |
| `?` | 任意一个字符 |
| `[0-9]` | 一个数字字符 |

示例：

```bash
ls *.log
find . -name '*.js'
```

路径中有空格时必须加引号或转义：

```bash
cd '/opt/my project'
```

单引号不展开变量，双引号会展开变量：

```bash
NAME='fee'
echo '$NAME'
echo "$NAME"
```

输出分别是：

```text
$NAME
fee
```

变量可能包含空格时，使用时通常应加双引号：

```bash
echo "$NAME"
```

## 十八、环境变量与 Bash 配置

查看环境变量：

```bash
printenv
echo "$PATH"
echo "$HOME"
```

只对当前终端临时设置：

```bash
export NODE_ENV=testing
echo "$NODE_ENV"
```

当前 SSH 退出后，这个设置就消失。

对单条命令设置：

```bash
NODE_ENV=testing node dist/app.js
```

把普通环境配置写入 Bash 启动文件：

```bash
nano ~/.bashrc
source ~/.bashrc
```

不要把数据库密码、私钥或生产密钥随意写进 `~/.bashrc`、命令历史或 Git 仓库。敏感变量应通过权限严格的配置文件、systemd 环境文件、PM2 配置注入机制或密钥服务管理。

查看命令历史：

```bash
history
history | tail -n 30
```

清除当前历史不是可靠的秘密保护手段，正确做法是不把秘密直接写在命令行中。

## 十九、软链接和真实路径

创建软链接：

```bash
ln -s /opt/fee-pro/client/dist /opt/fee-client-current
```

查看链接：

```bash
ls -l /opt/fee-client-current
readlink -f /opt/fee-client-current
```

软链接类似 Windows 快捷方式，但程序通常会把它当成路径使用。删除软链接本身不会删除它指向的目录：

```bash
rm /opt/fee-client-current
```

对软链接路径执行递归删除前要确认实际解析路径，避免误删目标内容。

## 二十、Shell 脚本基础

创建练习脚本：

```bash
nano /tmp/hello.sh
```

内容：

```bash
#!/usr/bin/env bash

set -e

echo "当前用户：$(whoami)"
echo "当前目录：$(pwd)"
date
```

增加执行权限并运行：

```bash
chmod +x /tmp/hello.sh
/tmp/hello.sh
```

也可以不增加执行权限，交给 Bash 执行：

```bash
bash /tmp/hello.sh
```

常见开头：

```bash
#!/usr/bin/env bash
set -euo pipefail
```

其中 `set -euo pipefail` 会让脚本在命令失败、使用未定义变量或管道失败时尽早退出。它适合严谨脚本，但也会改变错误处理行为，复制到旧脚本前应理解其影响。

## 二十一、Git 在 Ubuntu 上的常用命令

查看版本和配置：

```bash
git --version
git config --global user.name
git config --global user.email
```

查看仓库状态：

```bash
cd /opt/fee-pro
git status --short
git branch --show-current
git log --oneline -10
```

查看改动：

```bash
git diff
git diff --stat
```

拉取代码前先检查工作区：

```bash
git status --short
git pull
```

如果服务器上有未提交修改，不要直接执行覆盖、重置或强制拉取。先确认这些改动是谁产生的、是否需要备份或提交。

## 二十二、fee-pro 日常操作示例

### 22.1 进入项目并确认环境

```bash
cd /opt/fee-pro
pwd
git status --short
node -v
npm -v
```

### 22.2 查看项目目录

```bash
ls -lah
ls -lah server
ls -lah client/dist
```

### 22.3 修改后端测试配置

先备份：

```bash
cp -a server/src/configs/common.js "server/src/configs/common.js.bak.$(date +%Y%m%d%H%M%S)"
```

使用 Nano：

```bash
nano server/src/configs/common.js
```

查看差异并重新编译：

```bash
git diff -- server/src/configs/common.js
cd server
npm run build
```

### 22.4 查看 PM2 进程

```bash
pm2 list
pm2 show fee-app
pm2 show fee-task-manager
pm2 logs fee-app --lines 100
pm2 logs fee-task-manager --lines 100
```

### 22.5 重启 fee-pro

```bash
cd /opt/fee-pro/server
npm run build
pm2 restart fee-app --update-env
pm2 restart fee-task-manager --update-env
pm2 list
```

### 22.6 修改和验证 Nginx

备份：

```bash
sudo cp -a /etc/nginx/conf.d/fee-pro.conf "/etc/nginx/conf.d/fee-pro.conf.bak.$(date +%Y%m%d%H%M%S)"
```

编辑：

```bash
sudo nano /etc/nginx/conf.d/fee-pro.conf
```

检查并加载：

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx --no-pager
```

### 22.7 检查完整服务状态

```bash
pm2 list
sudo systemctl is-active nginx
sudo systemctl is-active mariadb
sudo systemctl is-active redis-server
sudo ss -lntp | grep -E ':80|:3000|:3306|:6379'
```

### 22.8 查看打点链路日志

```bash
sudo tail -f /var/log/nginx/fee-access.log
```

另开一个 SSH 窗口查看任务日志：

```bash
pm2 logs fee-task-manager --lines 100
```

检查服务端中间日志：

```bash
find /opt/fee-pro/server/log/kafka -type f | sort | tail -20
```

## 二十三、常见报错怎么理解

### 23.1 `Permission denied`

含义：当前用户没有读、写、执行或进入目录的权限。

排查：

```bash
whoami
id
ls -ld target-path
ls -l target-file
```

先判断应该使用 `sudo`，还是应该修正文件所有者。不要直接用 `chmod 777`。

### 23.2 `No such file or directory`

含义：路径不存在，也可能是大小写写错、当前目录不对或脚本带 Windows 换行符。

排查：

```bash
pwd
ls -lah
ls -lah /absolute/path
```

优先使用 Tab 自动补全，能减少路径拼写错误。

### 23.3 `command not found`

含义：程序未安装，或者所在目录不在 `PATH` 中。

排查：

```bash
command -v command-name
echo "$PATH"
apt search command-name
```

Node/npm/pm2 使用 nvm 安装时，重新登录后若找不到命令，检查：

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
node -v
```

### 23.4 `Address already in use`

含义：要监听的端口已被其他进程占用。

排查 3000 端口：

```bash
sudo ss -lntp | grep ':3000'
sudo lsof -iTCP:3000 -sTCP:LISTEN
```

先确认进程身份，再通过 PM2、systemd 或正常信号停止它，不要看到 PID 就直接 `kill -9`。

### 23.5 `Connection refused`

含义：目标机器可达，但对应端口没有服务监听，或服务主动拒绝。

排查：

```bash
sudo ss -lntp
systemctl --failed
pm2 list
curl -v http://127.0.0.1:3000/api/login/type
```

### 23.6 `No space left on device`

可能是磁盘容量或 inode 用完：

```bash
df -h
df -i
sudo du -xh --max-depth=1 /var/log | sort -h
```

不要直接批量删除数据库或日志。先识别增长来源，再使用日志轮转、备份和保留策略处理。

### 23.7 Vim 无法退出

按两次 `Esc`，然后：

保存退出：

```text
:wq
```

放弃修改退出：

```text
:q!
```

## 二十四、推荐的故障排查顺序

遇到“网页打不开”或“数据不更新”时，按层次排查，不要随机重装软件。

1. 确认当前机器、用户和目录。

   ```bash
   hostname
   whoami
   pwd
   ```

2. 确认资源没有耗尽。

   ```bash
   free -h
   df -h
   uptime
   ```

3. 确认服务状态。

   ```bash
   pm2 list
   sudo systemctl status nginx --no-pager
   sudo systemctl status mariadb --no-pager
   sudo systemctl status redis-server --no-pager
   ```

4. 查看最近日志。

   ```bash
   pm2 logs fee-app --lines 100
   pm2 logs fee-task-manager --lines 100
   sudo journalctl -u nginx -n 100 --no-pager
   ```

5. 确认端口监听。

   ```bash
   sudo ss -lntp | grep -E ':80|:3000|:3306|:6379'
   ```

6. 从内到外测试请求。

   ```bash
   curl http://127.0.0.1:3000/api/login/type
   curl http://127.0.0.1/api/login/type
   curl http://8.138.93.199/api/login/type
   ```

7. 最后检查 UFW、阿里云安全组、域名和 DNS。

这种顺序可以快速判断问题属于应用、依赖服务、Nginx、操作系统网络还是云平台网络。

## 二十五、安全操作原则

在云服务器上养成以下习惯：

- 日常使用普通用户，需要时只给单条命令加 `sudo`。
- 修改配置前先备份，修改后先做语法检查。
- 执行递归删除、移动、`chown -R`、`chmod -R` 前确认 `pwd` 和目标绝对路径。
- 不执行看不懂的网络脚本和命令，尤其是带 `curl ... | sudo bash` 的命令。
- 不把数据库、Redis、Node 内部端口直接开放到公网。
- SSH 端口优先只允许自己的固定出口 IP。
- 使用 SSH 密钥，禁用弱密码，定期更新系统安全补丁。
- 不把密码、Token、私钥提交到 Git。
- 关注 `/var/log`、项目日志和数据库的磁盘增长。
- 重要变更前创建 ECS 快照和数据库备份。

## 二十六、安全练习

下面的练习只使用 `/tmp/ubuntu-practice`，不会修改系统配置。

### 26.1 创建练习目录

```bash
mkdir -p /tmp/ubuntu-practice/config
cd /tmp/ubuntu-practice
pwd
```

### 26.2 创建并编辑文件

```bash
nano config/app.conf
```

输入：

```text
name=fee-practice
port=3000
```

用 `Ctrl+O`、回车保存，再用 `Ctrl+X` 退出。

### 26.3 查看、复制和搜索

```bash
cat config/app.conf
cp -a config/app.conf config/app.conf.bak
grep -n 'port' config/app.conf
ls -lah config
```

### 26.4 修改权限

```bash
chmod 600 config/app.conf
ls -l config/app.conf
```

### 26.5 压缩和检查

```bash
tar -czf config-backup.tar.gz config
tar -tzf config-backup.tar.gz
```

### 26.6 清理练习目录

先确认目标：

```bash
pwd
readlink -f /tmp/ubuntu-practice
ls -lah /tmp/ubuntu-practice
```

确认输出确实是 `/tmp/ubuntu-practice` 后：

```bash
cd /tmp
rm -r /tmp/ubuntu-practice
```

## 二十七、常用命令速查表

| 目标 | 命令 |
| --- | --- |
| 当前目录 | `pwd` |
| 列出文件 | `ls -lah` |
| 切换目录 | `cd /opt/fee-pro` |
| 返回上级 | `cd ..` |
| 返回家目录 | `cd ~` |
| 创建目录 | `mkdir -p path` |
| 创建空文件 | `touch file` |
| 复制文件 | `cp -a source target` |
| 移动/重命名 | `mv source target` |
| 删除文件 | `rm -i file` |
| 查看小文件 | `cat file` |
| 分页查看 | `less file` |
| 查看日志末尾 | `tail -n 100 file` |
| 实时查看日志 | `tail -f file` |
| 搜索内容 | `rg -n 'text' path` |
| 查找文件 | `find path -name '*.js'` |
| Nano 编辑 | `nano file` |
| Vim 编辑 | `vim file` |
| 查看用户 | `whoami`、`id` |
| 查看权限 | `ls -l file` |
| 修改权限 | `chmod 644 file` |
| 修改所有者 | `sudo chown user:group file` |
| 更新软件清单 | `sudo apt update` |
| 安装软件 | `sudo apt install package` |
| 查看进程 | `ps aux`、`pgrep -af name` |
| 实时资源 | `top`、`htop` |
| 查看端口 | `sudo ss -lntp` |
| 查看内存 | `free -h` |
| 查看磁盘 | `df -h` |
| 查看目录大小 | `du -sh path` |
| 服务状态 | `sudo systemctl status service` |
| 重启服务 | `sudo systemctl restart service` |
| 系统服务日志 | `sudo journalctl -u service -n 100` |
| HTTP 测试 | `curl -v URL` |
| 查看 Git 改动 | `git status --short`、`git diff` |
| PM2 进程 | `pm2 list` |
| PM2 日志 | `pm2 logs process-name` |

## 二十八、学习建议

不需要一次记住全部命令。先熟练下面这组，就已经可以完成大多数基础服务器操作：

```text
pwd
ls -lah
cd
cp -a
mv
rm -i
cat
less
tail -f
nano
sudo
apt
systemctl
journalctl
ss
curl
free
df
du
git status
pm2 list
```

真正重要的不是背参数，而是形成固定习惯：先确认当前用户和目录，修改前备份，修改后验证，出问题先看状态和日志。做到这几点，Ubuntu 服务器会比初看时直观很多。
