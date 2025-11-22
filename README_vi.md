<div align="center">

# SDVN Comfy Node
**Bộ node thông minh, hỗ trợ cách sử dụng ComfyUI dễ dàng và tiện lợi hơn**


[![](https://img.shields.io/badge/Website-stablediffusion.vn-0075ff)](https://stablediffusion.vn) [![](https://img.shields.io/badge/Group-Stable%20Diffusion%20VN-0075ff)](https://www.facebook.com/groups/stablediffusion.vn) [![](https://img.shields.io/discord/813085864355037235?color=blue&label=Discord&logo=Discord)](https://discord.gg/5SEtApPeyG) 

![ComfyUI Screenshot](/preview/preview.png)
</div>

___
[**Installing**](#Install)

[**Guide**](#Guide)
- [✨ Base Node](#BaseNode)
- [🏞️ Image](#Image)
- [📥 Download](#Download)
- [🧬 Merge](#Merge)
- [💡 Creative](#Creative)
- [👨🏻‍💻 Dev](#Dev)
- [💬 API](#API)
- [ℹ️ Info_check](#Info_check)
- [✨ Preset](#Preset)
- [🎭 Mask](#Mask)

[**Example**](#Example)

___
# Tổng quan

- Bộ toolkit node thông minh cho ComfyUI, bao phủ tải/tải về, merge, mask, layout và sinh ảnh qua API cho SD15, SDXL, Flux...
- Tích hợp sẵn tiện ích: tự nhận diện loại model (CFG/sampler/scheduler), hỗ trợ dịch + dynamic prompt trên ô văn bản, preset ControlNet/Apply Style, và thư viện model/style có sẵn (`model_lib*.json`, `lora_lib.json`, `styles.csv`).
- Hỗ trợ tải checkpoint, LoRA, ControlNet, upscale, IPAdapter/InstantID và nguồn ảnh (Pinterest/URL/Instagram) với gia tốc aria2c khi có.
- Cung cấp tiện ích đọc/chỉnh metadata, sắp xếp dây nối gọn (Pipe/Switch/Any), công cụ mask, và node API cho Gemini, OpenAI, Hugging Face, Deepseek.
- Thư mục `examples` chứa workflow mẫu; thư mục `preview` giúp xem nhanh giao diện/tác dụng mỗi nhóm node.

# Todo

- [x] Workflow Example
- [x] Guide
- [x] Install
___

# Bắt đầu nhanh

- Clone vào `custom_nodes`, sau đó cài phụ thuộc Python từ thư mục gốc ComfyUI: `pip install -r custom_nodes/SDVN_Comfy_node/requirements.txt`
- macOS/Windows: tự cài `aria2c` để dùng các node tải model.
- (Tùy chọn) Đổi `API_key.json.example` thành `API_key.json` và điền key; sao chép `my_styles.csv.example` thành `my_styles.csv` để tùy chỉnh style.
- Khởi động ComfyUI — các node sẽ xuất hiện dưới nhóm SDVN; danh sách node nên cài thêm nằm ngay dưới đây.
___

# Install

Cài đặt với các lệnh đơn giản: 
- `cd <đường_dẫn_đến_thư_mục_ComfyUI>/custom_nodes`
- `git clone https://github.com/StableDiffusionVN/SDVN_Comfy_node`
- Từ thư mục gốc ComfyUI, cài phụ thuộc: `pip install -r custom_nodes/SDVN_Comfy_node/requirements.txt`
- *Đối với máy Windows hoặc macOS, người dùng cần tự cài đặt `aria2c` để sử dụng các node tự động tải model.*

Bạn cũng nên cài đặt các node sau để có thể sử dụng đầy đủ các chức năng:
- [Dynamicprompts](https://github.com/adieyal/comfyui-dynamicprompts)
- [Inpaint crop](https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch)
- [TiledDiffusion](https://github.com/shiimizu/ComfyUI-TiledDiffusion)
- [IPAdapter_plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus)
- [Controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux)
___

# Guide

- **Đối với tất cả các node có chức năng tải về:** Hỗ trợ tải trực tiếp từ **civitai** và **huggingface** bằng liên kết địa chỉ model hoặc liên kết tải model.
- **Đối với tất cả các node tải ảnh bằng URL:** Tự động tải ảnh về từ đường dẫn hình ảnh. Có thể tự động tìm ảnh chất lượng cao nhất với link [Pinterest](https://www.pinterest.com/). Xem thêm [danh sách hỗ trợ](https://github.com/mikf/gallery-dl/blob/master/docs/supportedsites.md)
- **Đối với tất cả các node nhập văn bản:** Hỗ trợ **Google Dịch** và [**chức năng Dynamic Prompt**](https://github.com/adieyal/sd-dynamic-prompts/blob/main/docs/SYNTAX.md) (Wildcards folder: /ComfyUI/wildcards)
___
### BaseNode
*Bộ node thông minh thay thế các tác vụ cơ bản, giúp người dùng xây dựng quy trình thông minh và nhanh hơn*

![Base Nodes](/preview/base_node.png)

**📀 Load checkpoint / 🎨 Load Lora**

 Hỗ trợ 2 phương pháp: tải checkpoint trực tiếp và sử dụng, hoặc tải checkpoint về rồi dùng.
 - Nếu bạn để thông tin Download_url, checkpoint sẽ được chọn theo Ckpt_name
 - Nếu bạn nhập đường dẫn tải checkpoint và chọn Download - True, checkpoint sẽ được tải về thư mục checkpoints/loras và đặt tên theo Ckpt_url_name

Ngoài ra, hai node này còn hỗ trợ danh sách các checkpoint và LoRA thường dùng. Nếu model chưa có trong thư mục, sẽ tự động tải về.

**🏞️ Load Image / 🏞️ Load Image Url**

- Hỗ trợ 2 phương pháp tải ảnh: từ thư mục đầu vào hoặc từ URL / đường dẫn ảnh
- Hỗ trợ thư mục con trong thư mục đầu vào

**🏞️ Load Image Folder**

- Tải danh sách ảnh với số lượng từ một thư mục.
- Nếu random = True, ảnh sẽ được chọn ngẫu nhiên hoàn toàn; nếu không, sẽ lấy một dãy ảnh liền kề nhau.
- Nếu `number < 1`, toàn bộ thư mục ảnh sẽ được tải.

**🏞️ Load Pinterest**

Tự động tìm kiếm và tải ảnh từ Pinterest. Ảnh sẽ được tải về thư mục đầu vào, được sắp xếp vào các thư mục con riêng biệt.

- Url:
  - Nhận bất kỳ link ảnh Pinterest nào (ảnh đơn, board, board section, hoặc trang cá nhân) (ví dụ: https://www.pinterest.com/...). Nếu link bắt đầu bằng dấu gạch chéo /, sẽ tự động thêm tiền tố https://www.pinterest.com (ví dụ: /abc/vintage ⇨ https://www.pinterest.com/abc/vintage).
  - Nhận bất kỳ từ khóa nào và sẽ tự động tìm kiếm ảnh trên Pinterest với từ khóa đó.
- Range: Vị trí – Số lượng ảnh sẽ được tải về thư mục đầu vào.
- Number: Số lượng ảnh sẽ được tải và trả về. Nếu random = True, ảnh sẽ được chọn ngẫu nhiên từ danh sách đã tải; nếu không, ảnh sẽ được chọn theo vị trí xác định bởi seed.

**🏞️ Load Image Ultimate**

Đây là node mạnh mẽ kết hợp 5 chế độ tải khác nhau (Thư mục đầu vào, Thư mục tùy chỉnh, Pinterest, Insta, URL) để tăng tính linh hoạt cho quy trình. Các tùy chọn sẽ tự động thay đổi theo chế độ đã chọn, cách dùng tương tự các node tải ảnh ở trên.

**🔡 CLIP Text Encode**

- Hỗ trợ đồng thời cả Positive và Negative
- Hỗ trợ khả năng Random với Dynamic Prompt (Yêu cầu cài đặt node [Dynamicprompts](https://github.com/adieyal/comfyui-dynamicprompts))
- Hỗ trợ chức năng dịch
- Hỗ trợ Style Card.
- Bổ sung encoder nâng cao cho model đặc thù: **Qwen Edit Text Encoder / Plus** và **Kontext Reference** (đưa ảnh/mask tham chiếu vào conditioning/latent).

**🗂️ Prompt Styles**

- Hỗ trợ viết prompt dễ dàng hơn với các preset style được lưu sẵn và chọn lọc.
- Bạn có thể thêm hoặc chỉnh sửa style card bằng cách đổi tên và chỉnh sửa file my_styles.csv.example thành my_styles.csv.

**🎚️ Controlnet Apply**

Node tổng hợp đầy đủ các tùy chọn để sử dụng ControlNet trong một node duy nhất (Yêu cầu cài đặt node [Controlnet Aux](https://github.com/Fannovel16/comfyui_controlnet_aux))
- Có thể chọn Model Controlnet, Preprocessor (Tự động nhận diện Aux Preprocessor + Thêm tùy chọn đảo ngược ảnh), Union Type
- Hiển thị ảnh xem trước Preprocessor khi chạy
- Hỗ trợ tự động tải các model ControlNet phổ biến cho SD15, SDXL và Flux.
- Hỗ trợ sử dụng trực tiếp với ControlNet Inpaint Alimama Flux.
- Hỗ trợ xuất tham số để tích hợp với node AutoGenerate.
- Bản mở rộng: **Diffsynth Controlnet Apply** và **Diffsynth Union Lora Apply** cho người dùng workflow Diffusynth.

**🌈 Apply Style Model**

-	 Hỗ trợ tự động tải model style và CLIP
-	 Hỗ trợ làm việc với mask, giảm mẫu, và nhiều chế độ crop khác nhau (Lưu ý: các tính năng này có thể không hoạt động tốt với Redux 512). (Xem thêm Redux Adv: https://github.com/kaibioinfo/ComfyUI_AdvancedRefluxControl)

**⏳ Ksampler**

Node thông minh với nhiều tùy chọn nhanh giúp linh hoạt trong nhiều trường hợp khác nhau, giảm lỗi và tăng tính linh hoạt khi sử dụng.
- Chuyển 2 tùy chọn **negative** và **latent** thành tùy chọn.
  - Nếu không có Negative, sẽ thay bằng clip rỗng, cách kết nối với Flux sẽ đúng bản chất là không dùng Negative
  - Nếu không có Latent, sẽ tạo ảnh Latent rỗng theo kích thước Tile Width và Tile Height
- **ModelType:** Tự động điều chỉnh **CFG, Sampler name, Scheduler** cho từng loại model (SD15, SDXL, SDXL lightning, SDXL hyper, Flux ...). Giờ đây không còn đau đầu vì quá nhiều tùy chọn.
- **StepsType:** Tự động điều chỉnh Steps theo model và Denoise (Steps = Standing Steps x Denoise). Giúp tối ưu quá trình chính xác và nhanh nhất
- **Tiled:** Tự động chia nhỏ block theo nhiều phương án để giảm tải GPU khi chạy Ksampler, áp dụng với ảnh lớn và denoise thấp (Yêu cầu cài đặt node [TiledDiffusion](https://github.com/shiimizu/ComfyUI-TiledDiffusion)). Nếu không có latent, kích thước tile = tile_width/2, tile_height/2
- Hỗ trợ FluxGuidance

**👨‍🎨 Inpaint**

Node hỗ trợ Inpaint tổng hợp, tích hợp từ 4 node: Vae Encode, Latent Noise Mask, Vae Encode (For Inpainting), InpaintModelCondinging
- Vae Encode: Nếu Mask = None
- Vae Encode (For Inpainting): Nếu Postive hoặc Negative = None
- Latent Noise Mask: Nếu SetLatentNoiseMask = True
- InpaintModelCondinging: Nếu SetLatentNoiseMask = False, sử dụng tất cả Image, Vae, Postive, Negative

___

### Image
*Bộ node thông minh, hỗ trợ xử lý các tác vụ hình ảnh*

![Base Nodes](/preview/image_node.png)

**↗️ Upscale Image**

Node thông minh thay đổi kích thước và phóng to hình ảnh
- Chế độ Maxsize: Tự động tính toán và điều chỉnh kích thước ảnh sao cho không thay đổi tỉ lệ và không vượt quá kích thước yêu cầu
- Chế độ Resize: Tự động thay đổi kích thước theo yêu cầu
- Chế độ Scale: Tính kích thước ảnh theo chỉ số *scale
- Tùy chọn Model_name sẽ sử dụng model Upscale phù hợp, giúp giữ chi tiết hơn khi phóng to
- Hỗ trợ tự động tải các model upscale phổ biến.
**↗️ Upscale Latent**

Tương tự Upscale Image, nhưng sẽ thêm Vae Decoder và Vae Encoder để xử lý ảnh Latent, giúp quy trình gọn gàng hơn.

**🔄 Image List**

Kết hợp nhiều ảnh riêng lẻ thành một danh sách ảnh

**🔄 Image Repeat**

Lặp lại một ảnh để tạo thành danh sách.

**📁 Image From List**

Lọc ra một ảnh từ danh sách theo chỉ số đã chọn.

**🪄 Film Grain / 🪄 HSL Adjust / 🪄 Image Adjust / 🪄 White Balance**

Các node điều chỉnh ánh sáng, màu sắc, và áp dụng hiệu ứng cho hình ảnh.

![](preview/adj_image.jpeg)

**🔄 Flip Image**

Lật ảnh theo chiều ngang hoặc chiều dọc.

**🎨 Fill Background**

Tô màu vùng trong suốt của ảnh (có alpha channel) bằng một màu đặc.

![](preview/fill_background.jpeg)

**🧩 IC Lora Layout | ✂️ IC Lora Layout Crop**

Bộ node hỗ trợ tạo layout và cắt/chia ảnh khi sử dụng với IC Lora

![](preview/ic_layout.jpeg)

**🪄 Image Layout**

Node sắp xếp layout ảnh thông minh với nhiều chế độ linh hoạt, giúp tạo bản xem trước rõ ràng hơn trong quy trình

![](preview/image_layout.jpeg)
![](preview/image_layout2.jpeg)

**⏬️ Image Scraper**

- Tải ảnh từ website bằng gallery-dl.

**✂️ Crop By Ratio | 🔄 RGBA to RGB | ⚡️ Empty Latent Ratio**

- Các tiện ích cắt ảnh theo tỉ lệ, chuyển đổi màu và tạo latent rỗng.

**🧅 Overlay Two Images | 🎭 Mask → Transparent Color | 🧩 Overlay Mask Color on Image**

- Chồng ảnh và hiển thị mask với màu tùy chọn.

**🖼️ Save Image Compare**

- Lưu cặp ảnh trước/sau đặt cạnh nhau để so sánh nhanh trong workflow.

**🖼️ Image Gallery**

- Duyệt, phân trang và tải/thu thập ảnh (local hoặc URL/Pinterest) vào thư viện tạm.
___

### Download

*Bộ node hỗ trợ tải ảnh và model về thư mục tương ứng và sử dụng trực tiếp trên ComfyUI*
-  Hỗ trợ tải trực tiếp từ **civitai** và **huggingface** bằng địa chỉ model hoặc link tải model
-  Ngoài ra, một số node cung cấp danh sách các model phổ biến để tải nhanh và tiện lợi hơn.
-  Bổ sung các node tải IPAdapter, InstantID, DualCLIP, QuadrupleCLIP và nhiều loại model khác.
-  Các tiện ích tải thêm: **AnyDownload List**, tải ModelPatch/UNET/CLIP/Style/CLIP Vision, tải model upscale và VAE.
![Download Nodes](/preview/download_node.png)

___

### Merge

*Hỗ trợ cách điều chỉnh trọng số các Block Model thông minh và tiện lợi hơn so với các node gốc, khơi gợi nhiều sáng tạo hơn. Tham khảo thêm tại [SuperMerge](https://github.com/hako-mikan/sd-webui-supermerger), [Lora Block Weight](https://github.com/hako-mikan/sd-webui-lora-block-weight)*

![Merge Nodes](/preview/merge_node.png)

Hỗ trợ 3 kiểu cú pháp để điều chỉnh từng block
- Các giá trị không liệt kê sẽ lấy giá trị block cuối cùng
- {Block}: {Weight Block}
  - Ví dụ: SD15 có 12 block từ 0-11 
    - `0:1, 1:1, 2:1, 3:1, 4:0, 5:1` <=> `0:1, 1:1, 2:1, 3:1, 4:0, 5:1, 6:1, 7:1, 8:1, 9:1, 10:1, 11:1`
    - `2:0, 3:1` <=> `0:1, 1:1, 2:0, 3:1, 4:1, 5:1, 6:1, 7:1, 8:1, 9:1, 10:1, 11:1`
- {Weight Block}
  - Ví dụ: SDXL có 9 block từ 0-8
    - `0, 0, 0, 0, 1, 1`  <=> `0:0, 1:0, 2:0, 3:0, 4:1, 5:1, 6:1, 7:1, 8:1`
- {Range}: {Weight Block}
  - Ví dụ: Flux có 19 block kép từ 0-18
    - `0-10:0, 11-18:1` <=> `0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0, 10:0, 11:1, 12:1, 13:1, 14:1, 15:1, 16:1, 17:1, 18:1`
- Kết hợp 3 kiểu cú pháp
  - Ví dụ: SDXL có 9 block OUT từ 0-8
    - `0-3:0, 1, 6:1, 0` <=> `0:0, 1:0, 2:0, 3:0, 4:1, 5:0, 6:1, 7:0, 8:0`

**🧬 Model Merge**

- Node này hỗ trợ trộn 2 hoặc 3 checkpoint, tách LoRA từ 2 checkpoint — tương tự chức năng merge của Automatic1111.
- **Model Export**: lưu kết quả merge ra file và có thể chỉnh metadata.

[*Xem thêm ví dụ workflow*](#Example)

___

### Creative

Các node giúp xây dựng quy trình một cách thông minh

![Creative Nodes](/preview/creative_node.png)

**📊 IPAdapter weight**

- Sử dụng cùng cú pháp như node merge
  
**🔃 Translate**

- Hỗ trợ dịch và Dynamic prompt

**🔎 Any show**

- Node thông minh và linh hoạt hỗ trợ hiển thị bất kỳ loại dữ liệu nào, bao gồm hình ảnh, chuỗi, số nguyên, số thực, bool, mask và JSON.

**⚡️ Run test**

- Node đơn giản dùng để kiểm tra workflow mà không trả về kết quả.

**🔡 Any Input Type**

- Hỗ trợ nhập giá trị Math, Boolean (yes-no, true-false, 1-2)
- Hỗ trợ xuất ra list
- Node mạnh mẽ và linh hoạt để làm việc với văn bản hoặc số, hỗ trợ nhiều chế độ xuất. Dễ dàng nối nhiều đoạn văn bản bằng các từ khóa đại diện như in1, in2, in3.

![Any Input Type Nodes](/preview/anyinput_ex.png)

**🔡 Simple Any Input**

- Phiên bản đơn giản hơn của Any Input Type — node này tự động chuyển chuỗi đầu vào thành định dạng STRING, FLOAT, INT hoặc BOOL. Dấu phẩy (,) trong chuỗi sẽ dùng để tách thành nhiều phần và trả về dưới dạng list.

![Any Input Type Nodes](/preview/simpleanyinput.png)

**📐 Image Size**

- Node thông minh lấy chiều rộng và cao của ảnh (latent image). Ngoài ra, bạn có thể đặt kích thước tối đa với giá trị maxsize — kích thước sẽ không vượt quá giá trị này và giữ nguyên tỉ lệ, nếu maxsize = 0, ảnh giữ nguyên kích thước gốc.

![ImageSize node](/preview/imagesize.png)

**🔢 Seed**

- Node hỗ trợ nhập INT với tùy chọn random hóa và điều chỉnh biến, phù hợp cho các workflow tự động.

**🔄 Switch | #️⃣ Boolean | #️⃣ Logic Switch | 🔄 Auto Switch**

  - Bộ node hỗ trợ chuyển nhánh luồng, giúp tự động hóa workflow.

![](preview/boolean.jpeg)
![](preview/logicswitch.jpeg)
![](preview/autoswitch.jpeg)

**🪢 Pipe In | 🪢 Pipe Out | 🪢 Pipe Out All**

- Node giúp đơn giản hóa, sắp xếp và làm gọn kết nối trong workflow.

![](preview/pipe.jpeg)

**🔄 Any Repeat | 🔄 Any List**

- Node chuyển đổi dữ liệu đơn giản thành list.

**⚖️ Filter List | 📁 Any From List**

- Lọc dữ liệu trong một list.
  
Ví dụ: Workflow lọc ảnh có chiều rộng ≥ 1000px.

![](preview/filter_image.jpeg)

**💽 Load Text | 💽 Save Text**

- Bộ node hỗ trợ xử lý file .txt, bao gồm đọc, lưu và chỉnh sửa file văn bản.
- Node 💽 Load Text có ba cách tải văn bản theo thứ tự ưu tiên: chuỗi nhập ngoài, đường dẫn .txt tùy chọn, và file .txt trong thư mục đầu vào.

![](preview/text_node.jpeg)

**📋 Load Google Sheet**

- Node hỗ trợ đọc dữ liệu từ Google Sheet được chia sẻ công khai.

![](preview/sheet_google.jpeg)

**📋 Menu Option | 🔄 Dic Convert**

- Node hỗ trợ tạo tùy chọn tự động và thay đổi biến động theo đầu vào.

![](preview/dic_convert.jpeg)

**🎲 Random Prompt | 📋 Menu Option Extra | 🎚️ Sliders (x4)**

- Trộn prompt ngẫu nhiên và các widget phụ (menu option extra, slider100, slider1, int/float slider custom) giúp dựng UI nhanh hơn.
___

### Dev

- **Run Python Code**: chạy hàm Python tự viết trực tiếp trong workflow (hỗ trợ unpack dict/list).
- **Kontext Reference / Qwen Edit Text Encoder (+ Plus)**: encoder conditioning/văn bản nâng cao cho các model tham chiếu hoặc Qwen edit.
- **Save Image Compare + Image Gallery** cũng hữu ích cho debug và quản lý bộ ảnh.

### API

Hỗ trợ sử dụng các model AI qua API
- Hỗ trợ thiết lập API mặc định qua file: `.../SDVN_Custom_node/API_key.json` (Đổi tên API_key.json.example và điền API)
  - Lấy Gemini API: https://aistudio.google.com/app/apikey
  - Lấy HuggingFace API: https://huggingface.co/settings/tokens
  - Lấy OpenAI API (Chat GPT, Dall-E): https://platform.openai.com/settings/organization/api-keys
  - Lấy Deepseek API: https://platform.deepseek.com/api_keys

![API Nodes](/preview/api_node.png)

**💬 Chatbot**
- Hình ảnh: Hỗ trợ Gemini, ChatGPT
- Preset: Thêm lịch sử và câu mẫu cho từng trường hợp
- Hỗ trợ dịch và Dynamic prompt

![](preview/chatbot.jpeg)
![](preview/chatbot2.jpeg)
![](preview/chatbot3.jpeg)

**🎨 DALL-E 3 | 🎨 GPT Image**

- Hỗ trợ dịch và Dynamic prompt

![](preview/dalle-3.jpeg)
![](preview/gptimage.jpeg)
![](preview/gptimage_input.jpeg)
![](preview/gptimage_multi.jpeg)
![](preview/gpt_mask.jpeg)

**🎨 Gemini Flash 2 Image | 🎨 Google Imagen**

- Hỗ trợ dịch và Dynamic prompt
- Gemini Flash 2 Image cho phép sử dụng ảnh tham chiếu và tự động thay đổi kích thước theo giới hạn đặt trước

![](preview/gemini.jpeg)
![](preview/gemini_multi.jpeg)
![](preview/imagen.jpeg)

**🎨 Gemini 3 Pro Image**

- Sử dụng Gemini 3 Pro Image Preview, trả về cả ảnh và phần văn bản kèm theo
- Hỗ trợ tối đa 14 ảnh tham chiếu; có sẵn preset tỷ lệ khung hình và độ phân giải
- Hỗ trợ dịch + Dynamic prompt, tự lấy API trong `API_key.json` nếu để trống

___

# Info check

Bộ node hỗ trợ đọc metadata ảnh và model, chỉnh sửa thông tin model, và tạo ảnh bìa minh họa.

![Info Nodes](preview/info_node.png)

**ℹ️ Lora info | Model info editor**

Đọc và hiển thị thông tin của model LoRA và checkpoint, cũng như chỉnh sửa metadata trong các model này.

![](preview/info_model.jpeg)

**ℹ️ Image Info| ℹ️ Exif check | ℹ️ Metadata check**

Node hỗ trợ đọc mọi metadata nhúng trong ảnh.

![](preview/info_check.jpeg)
![](preview/info_check2.jpeg)

___

# Preset

Các node giúp đơn giản hóa quá trình xây dựng workflow. Các node được thiết kế xoay quanh node `💡 Auto Generate` để tối ưu hóa quy trình.

![](preview/preset_node.png)

**📋 Quick Menu**

- Trả về tên checkpoint, các LoRA và chuỗi đơn giản trong một node duy nhất.

**💿 Load Model**

- Tải checkpoint cùng tối đa 5 LoRA từ thư viện có sẵn.

**💡 Auto Generate**

- Node sẽ tự động tạo ảnh và tính toán các tham số để đảm bảo quá trình sinh ảnh nhanh và chính xác nhất có thể.
- Tự động chọn KSampler, Scheduler và CFG dựa trên model đầu vào (SD15, SDXL, Flux). Với SDXL, nếu steps = 8, các tham số sẽ được điều chỉnh theo SDXL Lightning. Người dùng có thể tự chọn KSampler, Scheduler, CFG qua tùy chọn AdvSetting.
- Tự động chia nhỏ ảnh và tạo workflow upscale–hires fix dựa trên model và kích thước sinh ảnh. Người dùng có thể tự chọn model upscale qua AdvSetting.
- Tự động nhận diện ngôn ngữ và dịch Prompt / Negative Prompt sang tiếng Anh.
- Phần prompt và negative prompt hỗ trợ dynamic prompt. (Khi Random_prompt = True và dùng với list, kết quả trả về sẽ thay đổi mỗi lần).
- Tự động chuyển sang quy trình img2img hoặc inpaint khi có ảnh đầu vào hoặc mask. Nếu model đầu vào là inpaint/fill, đặt inpaint_model = True để tự động thiết lập tham số tối ưu. Kích thước ảnh sẽ tự động điều chỉnh để giữ nguyên tỉ lệ ảnh gốc.
- Thêm cài đặt ControlNet và ApplyStyle qua tham số bằng node `🎚️ Controlnet Apply` và `🌈 Apply Style Model`. Có thể thêm nhiều tham số cùng lúc bằng node `🔄 Join Parameter`.
- Steps sẽ tự động tính lại theo giá trị denoise, công thức: `Step = Steps × Denoise`.

![](preview/Autogen.jpeg)
![](preview/Autogen_2.jpeg)
![](preview/Autogen_3.jpeg)
![](preview/Autogen_4.jpeg)
___

# Mask

Bộ node hỗ trợ xử lý mask cơ bản và nâng cao, cũng như inpainting.

![](preview/mask_node.png)

**🎭 Yolo Seg Mask**

- Node sử dụng model YOLO để tự động phát hiện mask chính xác, nhanh chóng và tiết kiệm GPU.

![](preview/yolo.jpeg)
![](preview/yolo_2.jpeg)
![](preview/yolo_3.jpeg)

**🧩 Mask Regions**

- Node này tách các vùng mask riêng biệt thành các mask riêng, hoạt động rất tốt với bộ node inpaint crop.

**📏 Get Mask Size**

- Trả về chiều rộng/chiều cao (và latent) của mask để xây dựng workflow phụ thuộc kích thước.

**⚡️ Crop Inpaint | 🔄 Loop Inpaint Stitch**

- Hai node này được xây dựng dựa trên bộ node (https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch), bạn cần cài đặt bộ node này trước khi sử dụng.
- Node Loop Inpaint Stitch dùng để inpaint nhiều vùng liên tục khi đầu vào là list. Nó ghép kết quả lại thành một ảnh duy nhất, lý tưởng cho việc inpaint nhiều vùng chỉ trong một lần chạy.

![](preview/inpaint_loop.jpg)

___

# Example

![](examples/wf3.png)
![](examples/wf9.png)
![](examples/wf15.png)
![](examples/wf16.png)
![](examples/wf17.png)
![](examples/wf21.png)

___

**Copyright**

- [Stable Diffusion VN](https://stablediffusion.vn/)
- [Group SDVN](https://www.facebook.com/groups/stablediffusion.vn)
- [Comfy.vn](https://comfy.vn/)
- [SDVN.ME](https://sdvn.me/)
- [fluxai.vn](https://colab.research.google.com/github/StableDiffusionVN/SDVN-WebUI/blob/main/SDVN_ComfyUI_Flux_v3.ipynb)

**Course**
- [hungdiffusion.com](https://hungdiffusion.com/)
