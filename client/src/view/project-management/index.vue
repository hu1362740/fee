<template>
  <div>
    <Card :bordered="false" shadow>
      <p slot="title">项目管理</p>
      <Button
        type="primary"
        icon="md-add"
        class="btn-add"
        @click="openAdd"
      >新增</Button>
      <Table :columns="columns" :data="projectList"></Table>
    </Card>
    <Modal
      v-model="modalVisible"
      :title="modalTitle"
      @on-ok="saveProject"
      @on-cancel="resetForm"
    >
      <Form
        ref="projectForm"
        :model="projectForm"
        :rules="rules"
        label-position="left"
        :label-width="90"
      >
        <FormItem label="项目标识" prop="projectName">
          <Input
            v-model="projectForm.projectName"
            placeholder="请输入 SDK 上报 project_name"
          />
        </FormItem>
        <FormItem label="显示名称" prop="displayName">
          <Input
            v-model="projectForm.displayName"
            placeholder="请输入页面展示名称"
          />
        </FormItem>
        <FormItem v-if="isEdit === false" label="项目 owner" prop="ownerUcid">
          <Select
            v-model="projectForm.ownerUcid"
            filterable
            remote
            clearable
            :loading="ownerLoading"
            :remote-method="searchOwner"
            placeholder="请输入 owner 账号"
          >
            <Option
              v-for="item in ownerUserList"
              :key="item.ucid"
              :value="item.ucid"
            >{{ item.account }}</Option>
          </Select>
        </FormItem>
        <FormItem label="项目备注">
          <Input
            v-model="projectForm.cDesc"
            type="textarea"
            :rows="3"
            placeholder="请输入项目说明"
          />
        </FormItem>
      </Form>
    </Modal>
  </div>
</template>

<script>
import { addProject, deleteProject, getProjectList, updateProject } from '@/api/project'
import { getUserSearch } from '@/api/user'

const EMPTY_FORM = {
  id: 0,
  projectName: '',
  displayName: '',
  cDesc: '',
  ownerUcid: ''
}

export default {
  name: 'ProjectManagement',
  data () {
    return {
      projectList: [],
      modalVisible: false,
      isEdit: false,
      ownerLoading: false,
      ownerUserList: [],
      projectForm: {
        ...EMPTY_FORM
      },
      rules: {
        projectName: [
          { required: true, message: '项目标识不能为空', trigger: 'blur' }
        ],
        displayName: [
          { required: true, message: '显示名称不能为空', trigger: 'blur' }
        ],
        ownerUcid: [
          { required: true, message: '项目 owner 不能为空', trigger: 'change' }
        ]
      },
      columns: [
        {
          title: '项目ID',
          key: 'id',
          width: 90,
          align: 'center'
        },
        {
          title: '显示名称',
          key: 'display_name',
          minWidth: 140,
          align: 'center'
        },
        {
          title: '项目标识',
          key: 'project_name',
          minWidth: 140,
          align: 'center'
        },
        {
          title: '抽样率',
          key: 'rate',
          width: 100,
          align: 'center',
          render: (h, params) => {
            const rate = (params.row.rate || 0) / 100
            return h('span', `${rate}%`)
          }
        },
        {
          title: '备注',
          key: 'c_desc',
          minWidth: 180,
          tooltip: true
        },
        {
          title: '操作',
          key: 'action',
          width: 140,
          align: 'center',
          render: (h, params) => {
            return h('div', [
              h('Tooltip', {
                props: {
                  content: '编辑'
                }
              }, [
                h('Icon', {
                  props: {
                    type: 'ios-create',
                    size: 24,
                    color: '#2db7f5'
                  },
                  style: {
                    cursor: 'pointer',
                    marginRight: '14px'
                  },
                  on: {
                    click: () => {
                      this.openEdit(params.row)
                    }
                  }
                })
              ]),
              h('Tooltip', {
                props: {
                  content: '删除'
                }
              }, [
                h('Icon', {
                  props: {
                    type: 'md-close',
                    size: 24,
                    color: '#dd5a43'
                  },
                  style: {
                    cursor: 'pointer'
                  },
                  on: {
                    click: () => {
                      this.confirmDelete(params.row)
                    }
                  }
                })
              ])
            ])
          }
        }
      ]
    }
  },
  computed: {
    modalTitle () {
      return this.isEdit ? '编辑项目' : '新增项目'
    }
  },
  mounted () {
    this.loadProjectList()
  },
  methods: {
    async loadProjectList () {
      const res = await getProjectList()
      this.projectList = res.data
    },
    openAdd () {
      this.isEdit = false
      this.modalVisible = true
      this.resetForm()
    },
    openEdit (row) {
      this.isEdit = true
      this.modalVisible = true
      this.projectForm = {
        id: row.id,
        projectName: row.project_name,
        displayName: row.display_name,
        cDesc: row.c_desc,
        ownerUcid: ''
      }
    },
    saveProject () {
      this.$refs.projectForm.validate(async valid => {
        if (valid === false) {
          this.$nextTick(() => {
            this.modalVisible = true
          })
          return
        }
        const request = this.isEdit ? updateProject : addProject
        const result = await request(this.projectForm)
        this.$Message.info(result.msg)
        if (result.action === 'success') {
          this.resetForm()
          await this.loadProjectList()
        } else {
          this.$nextTick(() => {
            this.modalVisible = true
          })
        }
      })
    },
    async searchOwner (query) {
      if (query === '') {
        this.ownerUserList = []
        return
      }
      this.ownerLoading = true
      const res = await getUserSearch({
        account: query,
        st: new Date()
      }).catch(() => {
        return {
          data: []
        }
      })
      this.ownerUserList = res.data
      this.ownerLoading = false
    },
    confirmDelete (row) {
      this.$Modal.confirm({
        title: '确认删除项目?',
        content: row.display_name || row.project_name,
        onOk: async () => {
          const result = await deleteProject({
            id: row.id
          })
          this.$Message.info(result.msg)
          if (result.action === 'success') {
            await this.loadProjectList()
          }
        }
      })
    },
    resetForm () {
      this.projectForm = {
        ...EMPTY_FORM
      }
      this.ownerUserList = []
      this.ownerLoading = false
      if (this.$refs.projectForm) {
        this.$refs.projectForm.resetFields()
      }
    }
  }
}
</script>

<style lang="less" scoped>
.btn-add {
  position: absolute;
  top: 10px;
  right: 10px;
}
</style>
