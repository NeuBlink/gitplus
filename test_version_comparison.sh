#\!/bin/bash

# Test the enhanced version comparison logic
compare_versions() {
  local pkg_ver="$1"
  local npm_ver="$2"
  
  # Extract base version (remove pre-release and build metadata)
  local pkg_base=$(echo "$pkg_ver" | sed 's/-.*$//' | sed 's/+.*$//')
  local npm_base=$(echo "$npm_ver" | sed 's/-.*$//' | sed 's/+.*$//')
  
  # Parse version components
  IFS='.' read -r pkg_major pkg_minor pkg_patch <<< "$pkg_base"
  IFS='.' read -r npm_major npm_minor npm_patch <<< "$npm_base"
  
  # Validate components are numeric and within safe limits
  for component in "$pkg_major" "$pkg_minor" "$pkg_patch" "$npm_major" "$npm_minor" "$npm_patch"; do
    if \! [[ "$component" =~ ^[0-9]+$ ]]; then
      echo "⚠️ Invalid version component: $component"
      return 2  # Cannot compare
    fi
    if [ "$component" -ge 1000 ]; then
      echo "⚠️ Version component >= 1000 not supported: $component"
      return 2  # Cannot compare
    fi
  done
  
  # Safe arithmetic comparison (all components < 1000)
  local pkg_num=$((pkg_major * 1000000 + pkg_minor * 1000 + pkg_patch))
  local npm_num=$((npm_major * 1000000 + npm_minor * 1000 + npm_patch))
  
  if [ $pkg_num -gt $npm_num ]; then
    return 0  # Package version is newer
  elif [ $pkg_num -eq $npm_num ]; then
    return 1  # Versions are equal
  else
    return 3  # Package version is older
  fi
}

# Test cases
echo "Testing version comparison logic:"
echo "================================"

# Test normal cases
echo -n "1.0.3 vs 1.0.2: "
compare_versions "1.0.3" "1.0.2"; echo "Result: $? (0=newer, 1=equal, 2=unsupported, 3=older)"

echo -n "1.0.2 vs 1.0.2: "
compare_versions "1.0.2" "1.0.2"; echo "Result: $? (0=newer, 1=equal, 2=unsupported, 3=older)"

echo -n "1.0.1 vs 1.0.2: "
compare_versions "1.0.1" "1.0.2"; echo "Result: $? (0=newer, 1=equal, 2=unsupported, 3=older)"

# Test pre-release versions
echo -n "1.0.0-beta.1 vs 1.0.0: "
compare_versions "1.0.0-beta.1" "1.0.0" 2>/dev/null; echo "Result: $? (should be 1=equal for base version)"

# Test large version numbers
echo -n "999.999.999 vs 1.0.0: "
compare_versions "999.999.999" "1.0.0" 2>/dev/null; echo "Result: $? (0=newer)"

echo -n "1000.0.0 vs 1.0.0: "
compare_versions "1000.0.0" "1.0.0" 2>/dev/null; echo "Result: $? (2=unsupported)"

