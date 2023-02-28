const { resolve } = require('path')
const consola = require('consola')
const { defu } = require('defu')

const meta = require('./package.json')

module.exports = function aliossModule(_moduleOptions) {
	const { runtimeConfig, alioss = {} } = this.options

	// Combine options
	const moduleOptions = {
		...alioss,
		..._moduleOptions,
		...(runtimeConfig && runtimeConfig.alioss)
	}

	// Apply defaults
	const options = defu(moduleOptions, {
		//客户端实例参数
		client: {
			//---------- 客户端实例参数
			//yourRegion填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
			region: process.env.ALI_OSS_REGION || '',
			//从STS服务获取的临时访问密钥（AccessKey ID和AccessKey Secret）。
			accessKeyId: process.env.ALI_OSS_ACCESS_KEY_ID || '',
			accessKeySecret: process.env.ALI_OSS_ACCESS_KEY_SECRET || '',
			//从STS服务获取的安全令牌（SecurityToken）。
			stsToken: process.env.ALI_OSS_STS_TOKEN || ''
		},
		//上传方法参数
		upload: {
			//设置并发上传的分片数量
			parallel: 50,
			//设置分片大小。默认值为1024kb
			partSize: Math.pow(1024, 2),
			//头部信息
			headers: {
				'Cache-Control': 'no-cache',
				'Content-Encoding': 'UTF-8'
			},
			//上传回调配置
			callback: {
				url: process.env.ALI_OSS_CALLBACK_URL || '',
				body:
					'bucket=${bucket}&object=${object}&etag=${etag}&size=${size}&mimeType=${mimeType}&imageInfo.height=${imageInfo.height}&imageInfo.width=${imageInfo.width}&imageInfo.format=${imageInfo.format}'
			}
		},
		//私有配置
		public: {
			//填写Bucket名称，例如examplebucket。
			bucket: process.env.ALI_OSS_BUCKET || '',
			//oss域名
			domain: process.env.ALI_OSS_DOMAIN || ''
		},
		//公有配置
		private: {
			//填写Bucket名称，例如examplebucket。
			bucket: process.env.ALV_OSS_BUCKET || '',
			//oss域名
			domain: process.env.ALV_OSS_DOMAIN || ''
		}
	})

	// Register plugin
	this.addPlugin({
		src: resolve(__dirname, 'plugin.js'),
		fileName: 'nuxt-ali-oss.js',
		options
	})

	consola.info(meta.name + ': v' + meta.version)
}

module.exports.meta = meta
