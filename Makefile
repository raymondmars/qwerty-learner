# 部署目标，需要时用环境变量覆盖：make deploy HOST=user@other
HOST ?= root@newcat
REMOTE_DIR ?= /root/up/qwerty/

# build 必须声明为伪目标：仓库里有同名的 build/ 目录（vite 的 outDir），
# 否则 make 认为目标已存在且无前置依赖，直接判定「up to date」跳过 yarn build，
# deploy 就会把上一次构建的残留推上线，还按旧产物 --delete 清理远端。
.PHONY: build deploy deploy-dry

build:
	yarn build

# rsync 带 --delete，构建一旦没有产出就会把远端删空。
# vite 有过静默失败（退出码 0、无产物）的先例，所以推送前先确认产物真的在。
deploy: build
	@test -s build/index.html || { echo "build/index.html 不存在或为空，构建没有产出，拒绝部署"; exit 1; }
	rsync -avz --delete build/ $(HOST):$(REMOTE_DIR)

# --delete 打在远端目录上，拿不准时先跑这个看清楚会删什么
deploy-dry: build
	rsync -avzn --delete build/ $(HOST):$(REMOTE_DIR)
