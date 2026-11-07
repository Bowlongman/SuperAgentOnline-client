export const cameraLimits={yaw:[-180,180],pitch:[5,89],distance:[2,30]};
export const defaultCameraPresets=[
  {id:'street',name:'街面斜视',yaw:0,pitch:20,distance:8},
  {id:'diagonal',name:'街区总览',yaw:45,pitch:46,distance:12},
  {id:'overhead',name:'高位俯视',yaw:0,pitch:85,distance:15}
];
export function validAngles(view){
  return !!view&&Object.entries(cameraLimits).every(([k,[min,max]])=>Number.isFinite(view[k])&&view[k]>=min&&view[k]<=max);
}
