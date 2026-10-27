// 예전 공유 링크(aks-sci-lab.web.app/pass/#…)를 새 주소로 넘김. 증 내용(# 뒤)은 서버로 가지 않고 그대로 따라감.
(function () {
    'use strict';
    var target = 'https://aks-sci-lab.github.io/teacher-desk/' + location.hash;
    document.getElementById('go').href = target;
    location.replace(target);
})();
