import { BaseService } from '../../base';
import * as svgCaptcha from 'svg-captcha';
import { Config, Inject, Provide } from '@midwayjs/decorator';
import { Utils } from '../../../common/utils';
import { isEmpty } from 'lodash';
import { AdminSysMenuService } from '../sys/menu';
import { InjectEntityModel } from '@midwayjs/orm';
import SysUser from '../../../entity/admin/sys/user';
import { Repository } from 'typeorm';
import { AdminSysLoginLogService } from '../sys/login_log';
import {
  IImageCaptchaOptions,
  IImageCaptchaResult,
  IPermMenuResult,
} from '../interface';
import { AdminSysUserService } from '../sys/user';
import { iConfigAesSecret } from '../../../interface';

@Provide()
export class AdminVerifyService extends BaseService {
  @Inject()
  utils: Utils;

  @Config('aesSecret')
  aesSecret: iConfigAesSecret;

  @Inject()
  adminSysMenuService: AdminSysMenuService;

  @Inject()
  adminSysLoginLogService: AdminSysLoginLogService;

  @Inject()
  adminSysUserService: AdminSysUserService;

  @InjectEntityModel(SysUser)
  user: Repository<SysUser>;

  /**
   * 生成图片验证码
   */
  async getImgCaptcha(
    params: IImageCaptchaOptions
  ): Promise<IImageCaptchaResult> {
    const svg = svgCaptcha.create({
      size: 4,
      color: true,
      noise: 4,
      width: params.width ?? 100,
      height: params.height ?? 50,
    });
    const result = {
      img: `data:image/svg+xml;base64,${Buffer.from(svg.data).toString(
        'base64'
      )}`,
      id: this.utils.generateUUID(),
    };
    // 10分钟过期时间
    await this.getAdminRedis().set(
      `admin:captcha:img:${result.id}`,
      svg.text,
      'EX',
      60 * 10
    );
    return result;
  }

  /**
   * 校验验证码
   */
  async checkImgCaptcha(id: string, code: string): Promise<boolean> {
    const result = await this.getAdminRedis().get(`admin:captcha:img:${id}`);
    if (isEmpty(result)) {
      return false;
    }
    if (code.toLowerCase() !== result!.toLowerCase()) {
      return false;
    }
    // 校验成功后移除验证码
    await this.getAdminRedis().del(`admin:captcha:img:${id}`);
    return true;
  }

  /**
   * 获取登录JWT
   * 返回null则账号密码有误，不存在该用户
   */
  async getLoginSign(username: string, password: string): Promise<string> {
    const decodeUserName = this.utils.aesDecrypt(
      username,
      this.aesSecret.front
    );
    const decodePassword = this.utils.aesDecrypt(
      password,
      this.aesSecret.front
    );
    const user = await this.user.findOne({
      username: decodeUserName,
      status: 1,
    });
    if (isEmpty(user)) {
      return null;
    }
    if (
      this.utils.aesDecrypt(user!.password, this.aesSecret.admin) !==
      decodePassword
    ) {
      return null;
    }
    const perms = await this.adminSysMenuService.getPerms(user!.id);
    const jwtSign = this.utils.jwtSign(
      {
        uid: parseInt(user!.id.toString()),
        pv: 1,
      },
      {
        expiresIn: '24h',
      }
    );
    await this.getAdminRedis().set(`admin:passwordVersion:${user!.id}`, 1);
    await this.getAdminRedis().set(`admin:token:${user!.id}`, jwtSign);
    await this.getAdminRedis().set(
      `admin:perms:${user!.id}`,
      JSON.stringify(perms)
    );
    // 保存登录日志
    await this.adminSysLoginLogService.save(user!.id);
    return jwtSign;
  }

  /**
   * 清除登录状态信息
   */
  async clearLoginStatus(uid: number): Promise<void> {
    await this.adminSysUserService.forbidden(uid);
  }

  /**
   * 获取权限菜单
   */
  async getPermMenu(uid: number): Promise<IPermMenuResult> {
    const menus = await this.adminSysMenuService.getMenus(uid);
    const perms = await this.adminSysMenuService.getPerms(uid);
    return { menus, perms };
  }

  async getRedisPasswordVersionById(id: number): Promise<string> {
    return this.getAdminRedis().get(`admin:passwordVersion:${id}`);
  }

  async getRedisTokenById(id: number): Promise<string> {
    return this.getAdminRedis().get(`admin:token:${id}`);
  }

  async getRedisPermsById(id: number): Promise<string> {
    return this.getAdminRedis().get(`admin:perms:${id}`);
  }
}