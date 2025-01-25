#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <node_api.h>

// Function to show share sheet
napi_value ShowShareSheet(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value args[3];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    // Get the file path from JavaScript
    char filePath[1024];
    size_t result;
    napi_get_value_string_utf8(env, args[0], filePath, 1024, &result);

    // Get x and y coordinates
    double x, y;
    napi_get_value_double(env, args[1], &x);
    napi_get_value_double(env, args[2], &y);

    @autoreleasepool {
        // Convert C string to NSString
        NSString* path = [NSString stringWithUTF8String:filePath];
        NSURL* fileURL = [NSURL fileURLWithPath:path];

        // Create sharing service on main thread
        dispatch_async(dispatch_get_main_queue(), ^{
            NSArray* items = @[fileURL];
            NSSharingServicePicker* picker = [[NSSharingServicePicker alloc] initWithItems:items];
            
            // Get the main window
            NSArray* windows = [NSApp windows];
            if ([windows count] > 0) {
                NSWindow* window = windows[0];
                NSView* contentView = [window contentView];
                
                // Convert window coordinates to view coordinates
                NSPoint windowPoint = NSMakePoint(x, [contentView frame].size.height - y);
                NSPoint viewPoint = [contentView convertPoint:windowPoint fromView:nil];
                
                // Create a small rect at the button's position
                NSRect targetRect = NSMakeRect(viewPoint.x - 1, viewPoint.y - 1, 2, 2);
                
                // Show the picker
                [picker showRelativeToRect:targetRect
                                  ofView:contentView
                           preferredEdge:NSMaxYEdge];
            }
        });
    }

    napi_value result_val;
    napi_get_undefined(env, &result_val);
    return result_val;
}

// Initialize the module
napi_value Init(napi_env env, napi_value exports) {
    napi_value fn;
    napi_create_function(env, nullptr, 0, ShowShareSheet, nullptr, &fn);
    napi_set_named_property(env, exports, "showShareSheet", fn);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
