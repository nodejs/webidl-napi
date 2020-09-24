{
  'targets': [
    {
      'target_name': 'example',
      'sources': [ 'example.idl', 'example.cc', 'init.cc', 'example-impl.cc' ],
      'include_dirs': [ "<!(node ../../index.js -I)" ],
      'rules': [
        {
          'rule_name': 'idl2cc',
          'extension': '.idl',
          'outputs': [ '<(RULE_INPUT_ROOT).cc' ],
          'action': [
            'node',
            '../../index.js',
            '-i', 'example-impl.h',
            '-o', '<(RULE_INPUT_ROOT).cc',
            '<(RULE_INPUT_PATH)',
          ]
        }
      ]
    }
  ]
}
