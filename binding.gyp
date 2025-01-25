{
  "targets": [
    {
      "target_name": "native_share",
      "sources": [ "native/share.mm" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "OTHER_CFLAGS": [
          "-ObjC++",
          "-framework Foundation",
          "-framework AppKit"
        ]
      }
    }
  ]
}
