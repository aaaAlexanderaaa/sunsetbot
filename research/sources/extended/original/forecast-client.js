function convertString2Url(cell) {
    // 识别字符串是否包含多个 url，如果包含，将其分割为数组，每个元素作为超链接
    const urls = cell.split('\n');
    const td = document.createElement('td');

    urls.forEach((url, index) => {  // 注意这里添加了 index 参数
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.textContent = (index+1);  // 使用 index 作为文本
        a.style.marginRight = '5px';
        a.style.whiteSpace = 'nowrap';  // 防止链接文字内部换行
        td.appendChild(a);
    });
    // 让 <td> 内部元素自动换行
    td.style.whiteSpace = 'normal';
    td.style.wordBreak = 'break-all';

    return td;
}

// 识别一个字符串是否包含 url
function containsUrl(inputString) {
    // 正则表达式匹配常见的 URL 格式
    return (inputString.includes("http") || inputString.includes("https"));
}

// 识别一个字符串是否包含 image
function containsImg(inputString) {
    // 正则表达式匹配常见的图片文件格式
    const imagePattern = /\.(jpg|jpeg|png|gif|svg)$/i;
    return imagePattern.test(inputString);
}

// 识别一个字符串是否包含 url
function drawConfusionMatrix(matrix, categories) {
    const container = document.getElementById('confusion-matrix-container');
    container.innerHTML = ''; // 清空旧内容

    const card = document.createElement('div');
    card.className = 'col-md-12 mb-4';
    card.innerHTML = `
        <div class="card bg-dark text-light">
            <div class="card-header fw-bold">实际质量 vs 预测质量 - 混淆矩阵</div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-bordered table-sm text-center text-light">
                        <thead>
                            <tr>
                                <th scope="col">实际\\预测</th>
                                ${categories.map(cat => `<th scope="col">${cat}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${categories.map(actual => `
                                <tr>
                                    <th scope="row">${actual}</th>
                                    ${categories.map(predicted => `
                                        <td>${matrix[actual][predicted]}</td>
                                    `).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    container.appendChild(card);
}

function enable_btn(btn_id){
	var btn = document.getElementById(btn_id);
	btn.disabled = false;
}

function remove_class(img_id){
	var img = document.getElementById(img_id);
    if (img.src != "https://sunsetbot.top/static/media/static_image/loading.gif"){
	    img.setAttribute("class","-");
	}
}


