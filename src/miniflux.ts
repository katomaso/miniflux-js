let esc: (str: string | null) => string | null = str => {
    if (str != null)
        return str.replace('"', '\\"').replace('\'', '\\\'');
    else
        return null
}

export class OfflineError extends Error{};
export class InvalidCredentialsError extends Error{};

export class Miniflux {
    private url: string;
    private username: string;
    private connected: boolean;
    private offline: boolean;
    private authorization: string;

    async connect(url: string, username: string, password: string): Promise<boolean> {
        if (this.connected) {
            return true;
        }
        this.url = url;
        this.username = username;
        this.authorization = `Basic ${btoa(username + ':' + password)}`;
        this.connected = await this.get_me().then((user: User) => Boolean(user.username));
        return this.connected;
    }
    get_url(): string { return this.url; }
    get_username(): string { return this.username; }
    is_connected(): boolean { return this.connected; }
    is_offline(): boolean { return this.offline; }

    request(path: string, data: any = null, method: string = 'GET'): Promise<any> {
        let options: RequestInit = {
            method: method,
            headers: {
                'Authorization': this.authorization
            }
        };

        if (data != null) {
            if (typeof data == 'object') {
                data = JSON.stringify(data);
            }
            options.body = data;
        }
        return fetch(new Request(this.url + path, options))
            .catch(err => {
            this.offline = true;
            throw new OfflineError("you are offline");
        })
            .then((response) => {
            this.offline = false;
            if (!response.ok) {
                if (response.status == 401) {
                    throw new InvalidCredentialsError("invalid credentials");
                }
                else {
                    throw new Error(`${response.status}: ${response.statusText}`);
                }
            }
            return response.json();
        });
    }
    get = (path: string): Promise<any> => this.request(path, null, 'GET')
    put = (path: string, data?: any): Promise<any> => this.request(path, data, 'PUT')
    post = (path: string, data: any): Promise<any> => this.request(path, data, 'POST')
    delete = (path: string): Promise<any> => this.request(path, null, 'DELETE')

    // POST /v1/discover
    discover = (url: string): Promise<FeedLink[]> => this.post('/v1/discover', `{"url":"${url}"}`)

    // GET /v1/feeds
    feeds = (): Promise<Feed[]> => this.get('/v1/feeds')

    // GET /v1/feeds/:feed_id
    get_feed = (feed_id: number): Promise<Feed> => this.get(`/v1/feeds/${feed_id}`)

    // GET /v1/feeds/:feed_id/icon
    get_feed_icon = (feed_id: number): Promise<Icon> => this.get(`/v1/feeds/${feed_id}/icon`)
    
    // POST /v1/feeds
    create_feed = (feed_url: number, category_id?: number): Promise<CreatedFeed> => {
        let feed_settings = `{"feed_url": "${feed_url}"`
        if (category_id !== 0) {
            feed_settings += ', "category_id": '
            feed_settings += category_id
        }
        feed_settings += '}'
        
        return this.post(`/v1/feeds`, feed_settings);
    }
    
    // PUT /v1/feeds/:feed_id
    update_feed = (feed_id: number, title?: string, category_id?: number): Promise<Feed> => {
        title = esc(title);
        if (title == null && category_id == null)
            return new Promise((resolve, reject) => reject('No title or category specified'));
        let feed_settings = '{';
        if (title != null)
            feed_settings += `"title": "${esc(title)}"`
        if (category_id != null) {
            if (title != null)
                feed_settings += ','
            feed_settings += `"category": {"id": ${category_id}}`
        }
        feed_settings += '}';

        return this.put(`/v1/feeds/${feed_id}`, feed_settings);
    }
    
    // PUT /v1/feeds/:feed_id/refresh
    refresh_feed = (feed_id: number): Promise<void> => this.put(`/v1/feeds/${feed_id}/refresh`)
    
    // DELETE /v1/feeds/:feed_id
    remove_feed = (feed_id: number): Promise<void> => this.delete(`/v1/feeds/${feed_id}`)
    
    // GET /v1/feeds/:feed_id/entries/:entry_id
    get_feed_entry = (feed_id: number, entry_id: number): Promise<Entry> => this.get(`/v1/feeds/${feed_id}/entries/${entry_id}`)
    
    // GET /v1/entries/:entry_id
    get_entry = (entry_id: number): Promise<Entry> => this.get(`/v1/entries/${entry_id}`)
    
    // GET /v1/feeds/:feed_id/entries
    // params: status, offset, limit, direction, order
    get_feed_entries = (feed_id: number, filter?: Filter): Promise<EntryList[]> => {
        let options = [];
        if (filter != null) {
            if (filter.status != null)
                options.push(`status=${filter.status}`)
            if (filter.offset != null)
                options.push(`offset=${filter.offset}`)
            if (filter.limit != null)
                options.push(`limit=${filter.limit}`)
            if (filter.direction != null)
                options.push(`direction=${filter.direction}`)
            if (filter.order != null)
                options.push(`order=${filter.order}`)
        }

        let path = `/v1/feeds/${feed_id}/entries`;
        if (options.length > 0) {
            path += '?';
            path += options.join('&');
        }
        return this.get(path);
    }
    
    
    // GET /v1/entries
    // params: status, offset, limit, direction, order
    get_entries = (filter?: Filter): Promise<EntryList> => {
        let options = [];
        if (filter != null) {
            if (filter.status != null)
                options.push(`status=${filter.status}`)
            if (filter.offset != null)
                options.push(`offset=${filter.offset}`)
            if (filter.limit != null)
                options.push(`limit=${filter.limit}`)
            if (filter.direction != null)
                options.push(`direction=${filter.direction}`)
            if (filter.order != null)
                options.push(`order=${filter.order}`)
        }

        let path = `/v1/entries`;
        if (options.length > 0) {
            path += '?';
            path += options.join('&');
        }
        return this.get(path);
    }
    
    // PUT /v1/entries
    update_entries = (entry_ids: number[], status: EntryStatus): Promise<void> => this.put(`/v1/entries`, `{\"entry_ids\": [${entry_ids.join(',')}], \"status\": \"${esc(status)}\"}`)
    
    // PUT /v1/entries/:entry_id/bookmark
    toggle_bookmark = (entry_id: number): Promise<void> => this.put(`/v1/entries/${entry_id}/bookmark`)
    
    // GET /v1/categories
    categories = (): Promise<Category[]> => this.get(`/v1/categories`)
    
    // POST /v1/categories
    create_category = (title: string): Promise<Category> => this.post('/v1/categories', `{\"title\": \"${esc(title)}\"}`)
    
    // PUT /v1/categories/:category_id
    update_category = (category_id: number, title: string): Promise<Category> => this.put(`/v1/categories/${category_id}`, `{\"title\": \"${esc(title)}\"}`)
    
    // DELETE /v1/categories/:category_id
    delete_category = (category_id: number): Promise<void> => this.delete(`/v1/categories/${category_id}`)
    
    // GET /v1/export
    ompl_export = (): Promise<string> => this.get('/v1/export')
    
    // POST /v1/users
    create_user = (username: string, password: string, is_admin: boolean): Promise<User> => this.post(`/v1/users`, `{\"username\":\"${esc(username)}\", \"password:\": \"${esc(password)}\", \"is_admin\": ${is_admin}}`)
    
    // PUT /v1/users/:user_id
    update_user = (user_id: number, user_settings: UserSettings): Promise<User> => this.put(`/v1/users/${user_id}`, user_settings)
    
    // GET /v1/users
    users = (): Promise<User[]> => this.get('/v1/users')
    
    // GET /v1/users/:user
    // note that this accepts a user's ID or username
    get_user = (user: number | string): Promise<User> => this.get(`/v1/users/${user}`)
    get_me = (): Promise<User> => this.get(`/v1/users/${this.username}`);

    // DELETE /v1/users/:user_id
    delete_user = (user_id: number): Promise<void> => this.delete(`/v1/users/${user_id}`)
}

export interface UserSettings {
    username?: string,
    password?: string,
    is_admin?: boolean,
    theme?: string,
    language?: string,
    timezone?: string,
}

export interface User {
    id: number,
    username: string,
    language: string,
    timezone: string,
    theme: string,
    entry_sorting_direction: EntryDirection,
}

export interface Filter {
    status?: EntryStatus,
    order?: EntryOrder,
    direction?: EntryDirection,
    limit?: number,
    offset?: number,
}

export enum EntryStatus {
    READ = 'read',
    UNREAD = 'unread',
    REMOVED = 'removed',
}

export enum EntryOrder {
    ID = 'id',
    STATUS = 'status',
    PUBLISHED_AT = 'published_at',
    CATEGORY_TITLE = 'category_title',
    CATEGORY_ID = 'category_id',
}

export enum EntryDirection {
    ASCENDING = 'asc',
    DESCENDING = 'desc',
}

export interface MinifluxError {
    error_message: string
}

export interface FeedLink {
    url: string,
    title: string,
    type: string
}

export interface CreatedFeed {
    "feed_id": number
}

export interface Category {
    id: number;
    user_id: number;
    title: string;
}

export interface IconReference {
    feed_id: number;
    icon_id: number;
}

export interface Feed {
    id: number;
    user_id: number;
    title: string;
    site_url: string;
    feed_url: string;
    rewrite_rules: string;
    scraper_rules: string;
    crawler: boolean;
    checked_at: string;
    etag_header: string;
    last_modified_header: string;
    parsing_error_count: number;
    parsing_error_message: string;
    category: Category;
    icon: IconReference;
}

export interface Icon {
    id: number;
    data: string;
    mime_type: string;
}

export interface Entry {
    id: number;
    user_id: number;
    feed_id: number;
    title: string;
    url: string;
    comments_url: string;
    author: string;
    content: string;
    hash: string;
    published_at: string;
    status: string;
    starred: boolean;
    feed: Feed;
}

export interface EntryList {
    total: number
    entries: Entry[]
}