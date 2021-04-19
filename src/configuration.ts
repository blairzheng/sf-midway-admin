import { App, Configuration } from '@midwayjs/decorator';
import { ILifeCycle, IMidwayContainer } from '@midwayjs/core';
import * as swagger from '@midwayjs/swagger';
import * as orm from '@midwayjs/orm';
import * as bull from 'midway-bull';
import { IMidwayWebApplication } from '@midwayjs/web';
import { AdminSysTaskService } from './service/admin/sys/task';
import * as moment from 'moment';

@Configuration({
  imports: [
    orm, // 加载 orm 组件
    bull, // 加载 bull 组件
    {
      component: swagger, // 加载 swagger 组件
      enabledEnvironment: ['local'],
    },
  ],
})
export class ContainerLifeCycle implements ILifeCycle {
  @App()
  app: IMidwayWebApplication;

  async onReady(container: IMidwayContainer): Promise<void> {
    // 初始化系统任务
    const taskService = await container.getAsync(AdminSysTaskService);
    await taskService.initTask();

    // Date time
    // eslint-disable-next-line no-extend-native
    Date.prototype.toJSON = function () {
      return moment(this).format('YYYY-MM-DD HH:mm:ss');
    };
  }
}
