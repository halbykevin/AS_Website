//! The plain C APIs of macOS the app calls (Core Graphics, Core Foundation, Accessibility), declared
//! by hand: a few dozen stable functions, so no binding crate to keep in step. Constants carry the
//! names from Apple's headers.
#![allow(non_upper_case_globals, non_snake_case, dead_code)]
use std::ffi::{c_char, c_void};

pub type CFTypeRef = *const c_void;
pub type CFStringRef = *const c_void;
pub type CFDictionaryRef = *const c_void;
pub type CFRunLoopRef = *mut c_void;
pub type CFRunLoopSourceRef = *mut c_void;
pub type CFMachPortRef = *mut c_void;
pub type CGEventRef = *mut c_void;
pub type CGEventSourceRef = *mut c_void;
pub type CGEventTapProxy = *mut c_void;
pub type CGImageRef = *mut c_void;
pub type CGContextRef = *mut c_void;
pub type CGColorSpaceRef = *mut c_void;
pub type CGDirectDisplayID = u32;

#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CGPoint { pub x: f64, pub y: f64 }
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct CGSize { pub width: f64, pub height: f64 }
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct CGRect { pub origin: CGPoint, pub size: CGSize }

// CGEventType
pub const kCGEventLeftMouseDown: u32 = 1;
pub const kCGEventLeftMouseUp: u32 = 2;
pub const kCGEventRightMouseDown: u32 = 3;
pub const kCGEventRightMouseUp: u32 = 4;
pub const kCGEventMouseMoved: u32 = 5;
pub const kCGEventLeftMouseDragged: u32 = 6;
pub const kCGEventRightMouseDragged: u32 = 7;
pub const kCGEventKeyDown: u32 = 10;
pub const kCGEventKeyUp: u32 = 11;
pub const kCGEventFlagsChanged: u32 = 12;
pub const kCGEventScrollWheel: u32 = 22;
pub const kCGEventOtherMouseDown: u32 = 25;
pub const kCGEventOtherMouseUp: u32 = 26;
pub const kCGEventOtherMouseDragged: u32 = 27;
pub const kCGEventTapDisabledByTimeout: u32 = 0xFFFF_FFFE;
pub const kCGEventTapDisabledByUserInput: u32 = 0xFFFF_FFFF;
// NSEventType values a trackpad produces that event taps also see (rotate, gesture begin/end,
// gesture, magnify, swipe, smart magnify, pressure).
pub const TRACKPAD_EVENTS: [u32; 8] = [18, 19, 20, 29, 30, 31, 32, 34];

// CGMouseButton
pub const kCGMouseButtonLeft: u32 = 0;
pub const kCGMouseButtonRight: u32 = 1;
pub const kCGMouseButtonCenter: u32 = 2;

// CGEventField
pub const kCGMouseEventClickState: u32 = 1;
pub const kCGMouseEventButtonNumber: u32 = 3;
pub const kCGKeyboardEventKeycode: u32 = 9;
pub const kCGEventSourceUserData: u32 = 42;

// CGEventFlags
pub const kCGEventFlagMaskAlphaShift: u64 = 0x0001_0000;
pub const kCGEventFlagMaskShift: u64 = 0x0002_0000;
pub const kCGEventFlagMaskControl: u64 = 0x0004_0000;
pub const kCGEventFlagMaskAlternate: u64 = 0x0008_0000;
pub const kCGEventFlagMaskCommand: u64 = 0x0010_0000;

// CGEventSourceStateID, CGEventTapLocation, CGEventTapPlacement, CGEventTapOptions, CGScrollEventUnit
pub const kCGEventSourceStateHIDSystemState: i32 = 1;
pub const kCGHIDEventTap: u32 = 0;
pub const kCGHeadInsertEventTap: u32 = 0;
pub const kCGEventTapOptionDefault: u32 = 0;
pub const kCGScrollEventUnitPixel: u32 = 0;

// CGDisplayChangeSummaryFlags
pub const kCGDisplayBeginConfigurationFlag: u32 = 1;

// CGImageAlphaInfo / CGBitmapInfo, CGInterpolationQuality
pub const kCGImageAlphaNoneSkipLast: u32 = 5;
pub const kCGBitmapByteOrder32Big: u32 = 4 << 12;
pub const kCGInterpolationMedium: i32 = 4;

pub type CGEventTapCallBack = unsafe extern "C" fn(CGEventTapProxy, u32, CGEventRef, *mut c_void) -> CGEventRef;
pub type CGDisplayReconfigurationCallBack = unsafe extern "C" fn(CGDirectDisplayID, u32, *mut c_void);

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    pub static kCFRunLoopDefaultMode: CFStringRef;
    pub static kCFBooleanTrue: CFTypeRef;
    pub static kCFTypeDictionaryKeyCallBacks: u8;
    pub static kCFTypeDictionaryValueCallBacks: u8;
    pub fn CFRelease(cf: CFTypeRef);
    pub fn CFDictionaryCreate(allocator: CFTypeRef, keys: *const CFTypeRef, values: *const CFTypeRef, count: isize, key_callbacks: *const c_void, value_callbacks: *const c_void) -> CFDictionaryRef;
    pub fn CFRunLoopGetCurrent() -> CFRunLoopRef;
    pub fn CFRunLoopRunInMode(mode: CFStringRef, seconds: f64, return_after_source_handled: u8) -> i32;
    pub fn CFRunLoopStop(run_loop: CFRunLoopRef);
    pub fn CFRunLoopAddSource(run_loop: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
    pub fn CFRunLoopRemoveSource(run_loop: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
    pub fn CFMachPortCreateRunLoopSource(allocator: CFTypeRef, port: CFMachPortRef, order: isize) -> CFRunLoopSourceRef;
    pub fn CFMachPortInvalidate(port: CFMachPortRef);
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    pub fn CGGetActiveDisplayList(max: u32, displays: *mut CGDirectDisplayID, count: *mut u32) -> i32;
    pub fn CGDisplayBounds(display: CGDirectDisplayID) -> CGRect;
    pub fn CGDisplayRegisterReconfigurationCallback(callback: CGDisplayReconfigurationCallBack, info: *mut c_void) -> i32;
    pub fn CGPreflightScreenCaptureAccess() -> bool;

    pub fn CGEventSourceCreate(state: i32) -> CGEventSourceRef;
    pub fn CGEventSourceSetLocalEventsSuppressionInterval(source: CGEventSourceRef, seconds: f64);
    pub fn CGEventSourceKeyState(state: i32, key: u16) -> bool;
    pub fn CGEventSourceButtonState(state: i32, button: u32) -> bool;
    pub fn CGEventCreate(source: CGEventSourceRef) -> CGEventRef;
    pub fn CGEventCreateMouseEvent(source: CGEventSourceRef, kind: u32, position: CGPoint, button: u32) -> CGEventRef;
    pub fn CGEventCreateKeyboardEvent(source: CGEventSourceRef, keycode: u16, down: bool) -> CGEventRef;
    pub fn CGEventCreateScrollWheelEvent2(source: CGEventSourceRef, units: u32, wheel_count: u32, wheel1: i32, wheel2: i32, wheel3: i32) -> CGEventRef;
    pub fn CGEventGetLocation(event: CGEventRef) -> CGPoint;
    pub fn CGEventGetType(event: CGEventRef) -> u32;
    pub fn CGEventSetType(event: CGEventRef, kind: u32);
    pub fn CGEventGetFlags(event: CGEventRef) -> u64;
    pub fn CGEventSetFlags(event: CGEventRef, flags: u64);
    pub fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
    pub fn CGEventSetIntegerValueField(event: CGEventRef, field: u32, value: i64);
    pub fn CGEventPost(tap: u32, event: CGEventRef);
    pub fn CGEventTapCreate(tap: u32, place: u32, options: u32, events_of_interest: u64, callback: CGEventTapCallBack, user_info: *mut c_void) -> CFMachPortRef;
    pub fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
    pub fn CGWarpMouseCursorPosition(position: CGPoint) -> i32;

    pub fn CGColorSpaceCreateDeviceRGB() -> CGColorSpaceRef;
    pub fn CGColorSpaceRelease(space: CGColorSpaceRef);
    pub fn CGBitmapContextCreate(data: *mut c_void, width: usize, height: usize, bits_per_component: usize, bytes_per_row: usize, space: CGColorSpaceRef, bitmap_info: u32) -> CGContextRef;
    pub fn CGContextSetInterpolationQuality(context: CGContextRef, quality: i32);
    pub fn CGContextDrawImage(context: CGContextRef, rect: CGRect, image: CGImageRef);
    pub fn CGContextRelease(context: CGContextRef);
    pub fn CGImageRelease(image: CGImageRef);
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    pub static kAXTrustedCheckOptionPrompt: CFStringRef;
    pub fn AXIsProcessTrusted() -> bool;
    pub fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
}

extern "C" {
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
}
/// dlfcn.h's RTLD_DEFAULT on macOS: search every image the process has loaded.
const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

/// CGDisplayCreateImage, looked up at run time: the macOS 15 SDK marks it obsoleted (it still works,
/// with Screen Recording access), so linking it directly would break the build on a newer SDK.
pub fn display_create_image() -> Option<unsafe extern "C" fn(CGDirectDisplayID) -> CGImageRef> {
    let symbol = unsafe { dlsym(RTLD_DEFAULT, c"CGDisplayCreateImage".as_ptr()) };
    (!symbol.is_null()).then(|| unsafe { std::mem::transmute::<*mut c_void, unsafe extern "C" fn(CGDirectDisplayID) -> CGImageRef>(symbol) })
}

/// Whether macOS lets this app post input events and install event taps (Privacy & Security →
/// Accessibility). With `prompt`, macOS shows its "would like to control this computer" dialog,
/// which leads to that setting, unless access is already allowed.
pub fn accessibility_trusted(prompt: bool) -> bool {
    if !prompt { return unsafe { AXIsProcessTrusted() }; }
    unsafe {
        let keys = [kAXTrustedCheckOptionPrompt];
        let values = [kCFBooleanTrue];
        let options = CFDictionaryCreate(std::ptr::null(), keys.as_ptr(), values.as_ptr(), 1,
            &kCFTypeDictionaryKeyCallBacks as *const u8 as *const c_void, &kCFTypeDictionaryValueCallBacks as *const u8 as *const c_void);
        let trusted = AXIsProcessTrustedWithOptions(options);
        if !options.is_null() { CFRelease(options); }
        trusted
    }
}

/// An owned Core Foundation object (CGEvent, CGEventSource, ...), released on drop.
pub struct Owned(pub *mut c_void);
impl Owned {
    pub fn new(pointer: *mut c_void) -> Option<Self> { (!pointer.is_null()).then_some(Self(pointer)) }
}
impl Drop for Owned { fn drop(&mut self) { unsafe { CFRelease(self.0) } } }
// CGEventSource and CGEvent are thread-safe Core Foundation types.
unsafe impl Send for Owned {}
unsafe impl Sync for Owned {}
