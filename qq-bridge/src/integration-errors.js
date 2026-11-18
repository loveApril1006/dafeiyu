// Stable public diagnostics: do not forward upstream response bodies, cookies,
// launch URLs or absolute paths into browser/chat errors.
export function integrationFailure(error,service='功能'){
 const status=Number(error?.status||error?.statusCode),message=String(error?.message||'');
 if(['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND','ENOENT'].includes(error?.code))return {status:503,data:{ok:false,code:'INTEGRATION_BUNDLE_INCOMPLETE',error:service+'运行文件缺失或迁移路径失效，请运行完整修复更新包；原账号与记录保留'}};
 if(['EACCES','EPERM'].includes(error?.code))return {status:503,data:{ok:false,code:'INTEGRATION_DATA_ACCESS',error:service+'数据目录无法读写，请检查原安装目录的权限、只读属性及占用情况'}};
 if(status===401||/未登录|登录已失效|凭证.*(?:失效|过期)|CredentialNo|需要.*登录|请先.*(?:扫码|登录)/i.test(message))return {status:401,data:{ok:false,code:'INTEGRATION_LOGIN_REQUIRED',error:service+'登录已失效或未完成，请在对应后台重新登录'}};
 if(status===403)return {status:403,data:{ok:false,code:'INTEGRATION_FORBIDDEN',error:service+'访问被拒绝，请检查登录账号是否有权查看该内容'}};
 if(status===429)return {status:429,data:{ok:false,code:'INTEGRATION_RATE_LIMIT',error:service+'请求频率受限，请稍后再试'}};
 if(['ECONNREFUSED','ENOTFOUND','ETIMEDOUT'].includes(error?.code)||/TimeoutError|AbortError/.test(error?.name||''))return {status:503,data:{ok:false,code:'INTEGRATION_UNAVAILABLE',error:service+'服务暂时无法连接，请检查本机服务和网络状态'}};
 return {status:status>=400&&status<=599?status:400,data:{ok:false,code:'INTEGRATION_REQUEST_FAILED',error:(service+'操作未完成：'+message).replace(/https?:\/\/\S+/gi,'[服务地址]').replace(/(?:[A-Za-z]:[\\/]|file:\/\/\/)[^\s"']+/g,'[本机路径]').replace(/(?:Bearer\s+|(?:token|api.?key|sessdata|bili_jct)\s*[:=]\s*)[^\s,;"']+/gi,'[凭据已隐藏]').replace(/[A-Za-z0-9_+/=-]{32,}/g,'[已隐藏]').slice(0,240)}};
}
