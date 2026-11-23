Pod::Spec.new do |s|
  s.name           = 'AttendanceFace'
  s.version        = '1.0.0'
  s.summary        = 'On-device face enrollment for attendance'
  s.description    = 'Detects a face, checks a head turn, and stores one encrypted face template.'
  s.license        = { :type => '0BSD' }
  s.author         = 'Attendance'
  s.homepage       = 'https://docs.expo.dev'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/expo/expo.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'UIKit', 'Security'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
