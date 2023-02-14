module.exports = {
	root: true,
	env: {
		node: true
	},
	extends: ['plugin:vue/essential', 'eslint:recommended'],
	rules: {
		'no-console': 'off',
		'no-debugger': 'off',
		'no-alert': 'off',
		'no-unused-vars': 'off',
		'vue/no-mutating-props': 'off', //允许子组件直接修改props
		'no-mixed-spaces-and-tabs': 'off',
		'no-useless-escape': 'off',
		'no-empty': 'off',
		quotes: ['error', 'single'],
		semi: ['error', 'never']
	},
	parserOptions: {
		parser: 'babel-eslint'
	}
}
