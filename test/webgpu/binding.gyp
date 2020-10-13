{
  'targets': [
    {
      'target_name': 'webgpu',
      'sources': [ 'webgpu.idl', 'webgpu.cc', 'init.cc', 'webgpu-impl.cc' ],
      'include_dirs': [ "<!(node ../../index.js -I)" ],
      'rules': [
        {
          'rule_name': 'idl2cc',
          'extension': '.idl',
          'outputs': [ '<(RULE_INPUT_ROOT).cc' ],
          'action': [
            'node',
            '../../index.js',
            '-i', 'webgpu-impl.h',
            '-o', '<(RULE_INPUT_ROOT).cc',
            '<(RULE_INPUT_PATH)',
          ]
        }
      ]
    }
  ]
}
