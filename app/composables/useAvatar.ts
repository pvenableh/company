import { ref } from 'vue';
export const avatarSource = ref('');

export default function updateAvatarSource(val: string) {
	avatarSource.value = val;
}
// if (user.value) {
// 	if (user.value.avatar) {
// 		avatarSource.value = runtimeConfig.public.assetsUrl + user.value.avatar + '?key=medium';
// 	} else {
// 		avatarSource.value =
// 			'https://ui-avatars.com/api/?name=' +
// 			user.value?.first_name +
// 			' ' +
// 			user.value?.last_name +
// 			'&background=eeeeee&color=00bfff';
// 	}
// } else {
// 	avatarSource.value = 'https://ui-avatars.com/api/?name=Unknown%20User&background=eeeeee&color=00bfff';
// }
