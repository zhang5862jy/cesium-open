in vec3 position;
in vec2 st;
in vec3 instancePositionHigh;
in vec3 instancePositionLow;
in vec4 instanceQuaternion;
in vec3 instanceScale;
in vec4 instanceColor;

out vec2 v_st;
out vec3 v_normalEC;
out vec4 v_color;

vec3 rotateByQuaternion(vec3 value, vec4 quaternion) {
    return value + 2. * cross(quaternion.xyz, cross(quaternion.xyz, value) + quaternion.w * value);
}

void main() {
    vec3 localPosition = position * instanceScale;
    vec3 worldOffset = rotateByQuaternion(localPosition, instanceQuaternion);
    vec4 positionRTE = czm_translateRelativeToEye(instancePositionHigh, instancePositionLow + worldOffset);

    vec3 localNormal = normalize(position / max(instanceScale, vec3(.0001)));
    vec3 worldNormal = rotateByQuaternion(localNormal, instanceQuaternion);
    v_normalEC = normalize(czm_viewRotation * worldNormal);
    v_st = st;
    v_color = instanceColor;
    gl_Position = czm_modelViewProjectionRelativeToEye * positionRTE;
}
