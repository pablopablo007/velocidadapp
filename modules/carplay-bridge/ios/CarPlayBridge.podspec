Pod::Spec.new do |s|
  s.name           = 'CarPlayBridge'
  s.version        = '1.0.0'
  s.summary        = 'Pantalla de CarPlay de Velocidad'
  s.description    = 'Escena de CarPlay (categoría de tareas de conducción) con velocidad, límite y viaje.'
  s.license        = 'MIT'
  s.author         = 'Velocidad'
  s.homepage       = 'https://github.com/pablopablo007/velocidadapp'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CarPlay', 'CoreLocation'

  s.source_files = '**/*.swift'
end
