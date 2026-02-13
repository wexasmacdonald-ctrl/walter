from pathlib import Path
path = Path('features/route-planner/MapScreen.native.tsx')
text = path.read_text()
start = text.index('  const renderOverlay = () => {')
end = text.index('  const renderMapTypeToggle = () => (')
old = text[start:end]
new = """  const renderOverlay = () => {
    if (DISABLE_OVERLAY_IN_DEV) {
      logOverlay('overlay disabled in dev')
      return null
    }
    if (loading && !requestingLocation) {
      logOverlay('loading pins', { pinCount: pins.length })
      return (
        <View style={styles.mapOverlay}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mapOverlayText}>Loading pins...</Text>
        </View>
      )
    }

    if (requestingLocation) {
      logOverlay('requesting location')
      return (
        <View style={styles.mapOverlay}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mapOverlayText}>Fetching your location...</Text>
        </View>
      )
    }

    if (permissionDenied) {
      logOverlay('location permission denied')
      return (
        <View style={styles.mapOverlay}>
          <Text style={styles.mapOverlayText}>Location permission denied. Enable it to show your dot.</Text>
        </View>
      )
    }

    if (markers.length === 0) {
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Pins appear after the locations finish loading.</Text>
        </View>
      )
    }

    return null
  }
"""
path.write_text(text.replace(old, new))
