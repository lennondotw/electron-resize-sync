// Prints the bit depth and extended dynamic range headroom macOS reports for
// each connected screen, as JSON.
import AppKit
import Foundation

let screens = NSScreen.screens.map { screen -> [String: Any] in
  [
    "name": screen.localizedName,
    "bitsPerSample": screen.depth.bitsPerSample,
    "bitsPerPixel": screen.depth.bitsPerPixel,
    "colorSpace": screen.colorSpace?.localizedName ?? "unknown",
    "edrPotential": screen.maximumPotentialExtendedDynamicRangeColorComponentValue,
    "edrCurrent": screen.maximumExtendedDynamicRangeColorComponentValue,
  ]
}
let data = try JSONSerialization.data(withJSONObject: screens, options: [.prettyPrinted, .sortedKeys])
print(String(decoding: data, as: UTF8.self))
